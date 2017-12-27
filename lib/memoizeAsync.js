(function (root, factory) {
    /* istanbul ignore next */
    if (typeof exports === 'object') {
        module.exports = factory(require('lru-cache'));
    } else if (typeof define === 'function' && define.amd) {
        define(['LRUCache'], factory);
    } else {
        root.memoizeAsync = factory(root.LRUCache);
    }
}(this, function (LRU) {
    var defer;
    if (typeof setImmediate === 'function') {
        // Node 0.10+
        defer = setImmediate;
    } else if (typeof process === 'object' && process && process.nextTick) {
        defer = process.nextTick;
    } else {
        // Browser
        defer = function (fn) {
            setTimeout(fn, 0);
        };
    }

    var nextCacheKeyPrefix = 1;
    return function memoizeAsync(lambda, options) {
        options = options || {};
        var argumentsStringifier = options.argumentsStringifier || function (args) {
                return args.map(String).join('\x1d'); // Group separator
            },
            waitingCallbacksByStringifiedArguments = {},
            cacheKeyPrefix,
            cache;

        if ('cacheKeyPrefix' in options) {
            cacheKeyPrefix = String(options.cacheKeyPrefix);
        } else {
            cacheKeyPrefix = nextCacheKeyPrefix + '\x1d';
            nextCacheKeyPrefix += 1;
        }

        if (options.cache) {
            cache = options.cache;
        } else {
            var lruCacheOptions = {};
            for (var propertyName in options) {
                if (Object.prototype.hasOwnProperty.call(options, propertyName)) {
                    var value = options[propertyName];
                    if (propertyName === 'length') {
                        // Make sure that the 'length' function gets called with the resultCallbackParams as actual parameters
                        // so it matches the signature of the callback:
                        lruCacheOptions.length = function (resultCallbackParams) {
                            return options.length.apply(this, resultCallbackParams);
                        };
                    } else if (propertyName !== 'argumentsStringifier' && propertyName !== 'cacheKeyPrefix') {
                        lruCacheOptions[propertyName] = value;
                    }
                }
            }
            cache = new LRU(lruCacheOptions);
        }

        function getAge() { // ...
            var entry = cache._cache[cacheKeyPrefix + argumentsStringifier(Array.prototype.slice.call(arguments))];
            if (!entry) {
                return -1;
            }
            if (entry.now === 0) {
                // node-lru doesn't bother maintaining entry.now when there's no maxAge specified.
                return;
            }
            return Date.now() - entry.now;
        }

        function memoizer() { // ...
            var that = this, // In case you want to create a memoized method
                args = Array.prototype.slice.call(arguments),
                cb = args.pop(),
                stringifiedArguments = argumentsStringifier(args);

            if (stringifiedArguments === false) {
                return lambda.apply(options.context || that, arguments);
            }
            stringifiedArguments = String(stringifiedArguments); // In case the function returns a non-string

            var resultCallbackParams = cache.get(cacheKeyPrefix + stringifiedArguments),
                updateCache = false;

            if (typeof resultCallbackParams !== 'undefined') {
                if ((memoizer.refreshAge && getAge.apply(null, args) > memoizer.refreshAge) && !waitingCallbacksByStringifiedArguments[stringifiedArguments]) {
                    updateCache = true;
                    // Indicate that the value is being refreshed so that further calls
                    // won't cause a new call of the memoized function:
                    waitingCallbacksByStringifiedArguments[stringifiedArguments] = [];
                }
                defer(function () {
                    cb.apply(that, resultCallbackParams);
                });
            } else if (waitingCallbacksByStringifiedArguments[stringifiedArguments]) {
                waitingCallbacksByStringifiedArguments[stringifiedArguments].push(cb);
            } else {
                waitingCallbacksByStringifiedArguments[stringifiedArguments] = [cb];
                updateCache = true;
            }

            if (updateCache) {
                lambda.apply(options.context || that, args.concat(function () { // ...
                    var resultCallbackParams = Array.prototype.slice.call(arguments),
                        waitingCallbacks = waitingCallbacksByStringifiedArguments[stringifiedArguments];
                    if (!resultCallbackParams[0] || options.errors) {
                        cache.set(cacheKeyPrefix + stringifiedArguments, resultCallbackParams);
                    }
                    if (waitingCallbacks) {
                        delete waitingCallbacksByStringifiedArguments[stringifiedArguments];
                        // Wait another tick in case an ill-behaved lambda called its callback immediately:
                        defer(function () {
                            waitingCallbacks.forEach(function (cb) {
                                cb.apply(that, resultCallbackParams);
                            });
                        });
                    }
                }));
            }
        }

        memoizer.refreshAge = options.refreshAge || null;
        memoizer.cache = cache;
        memoizer.cacheKeyPrefix = cacheKeyPrefix;
        memoizer.argumentsStringifier = argumentsStringifier;
        memoizer.getAge = getAge;

        memoizer.peek = function () { // ...
            return cache.peek(cacheKeyPrefix + argumentsStringifier(Array.prototype.slice.call(arguments)));
        };

        memoizer.getTtl = function () { // ...
            var entry = cache._cache[cacheKeyPrefix + argumentsStringifier(Array.prototype.slice.call(arguments))];
            if (!entry) {
                return -1;
            }
            if (entry.now === 0) {
                // node-lru doesn't bother maintaining entry.now when there's no maxAge specified.
                return;
            }
            return Math.max(-1, entry.now - Date.now() + cache._maxAge);
        };

        memoizer.purge = function () { // ...
            cache.del(cacheKeyPrefix + argumentsStringifier(Array.prototype.slice.call(arguments)));
        };

        memoizer.purgeAll = function () {
            // Cannot use cache.forEach with cache.del in the callback, that screws up the iteration.
            var keys = cache.keys();
            for (var i = 0 ; i < keys.length ; i += 1) {
                var key = keys[i];
                if (key.indexOf(cacheKeyPrefix) === 0) {
                    cache.del(key);
                }
            }
        };

        return memoizer;
    };
}));
