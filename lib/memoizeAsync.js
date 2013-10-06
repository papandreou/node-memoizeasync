(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory(require('lru-cache'));
    } else if (typeof define === 'function' && define.amd) {
        define(['LRUCache'], factory);
    } else {
        root.memoizeAsync = factory(root.LRUCache);
    }
}(this, function (LRU) {
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
            cacheKeyPrefix = nextCacheKeyPrefix + '\x1d',
            nextCacheKeyPrefix += 1;
        }

        if (options.cache) {
            cache = options.cache;
        } else {
            var lruOptions = {};
            for (var propertyName in options) {
                if (Object.prototype.hasOwnProperty.call(options, propertyName)) {
                    var value = options[propertyName];
                    if (propertyName === 'length') {
                        // Make sure that the 'length' function gets called with the resultCallbackParams as actual parameters
                        // so it matches the signature of the callback:
                        lruOptions.length = function (resultCallbackParams) {
                            return value.apply(this, resultCallbackParams);
                        };
                    } else if (propertyName !== 'argumentsStringifier' && propertyName !== 'cacheKeyPrefix') {
                        lruOptions[propertyName] = value;
                    }
                }
            }
            cache = new LRU(lruOptions);
        }

        function memoizer() { // ...
            var that = this, // In case you want to create a memoized method
                args = Array.prototype.slice.call(arguments),
                cb = args.pop(),
                stringifiedArguments = String(argumentsStringifier(args)), // In case the function returns a non-string
                resultCallbackParams = cache.get(cacheKeyPrefix + stringifiedArguments);

            if (typeof resultCallbackParams !== 'undefined') {
                process.nextTick(function () {
                    cb.apply(that, resultCallbackParams);
                });
            } else if (waitingCallbacksByStringifiedArguments[stringifiedArguments]) {
                waitingCallbacksByStringifiedArguments[stringifiedArguments].push(cb);
            } else {
                waitingCallbacksByStringifiedArguments[stringifiedArguments] = [cb];
                lambda.apply(options.context || that, args.concat(function () { // ...
                    var resultCallbackParams = arguments,
                        waitingCallbacks = waitingCallbacksByStringifiedArguments[stringifiedArguments];
                    cache.set(cacheKeyPrefix + stringifiedArguments, resultCallbackParams);
                    delete waitingCallbacksByStringifiedArguments[stringifiedArguments];
                    // Wait another tick in case an ill-behaved lambda called its callback immediately:
                    process.nextTick(function () {
                        waitingCallbacks.forEach(function (cb) {
                            cb.apply(that, resultCallbackParams);
                        });
                    });
                }));
            }
        }

        memoizer.cache = cache;
        memoizer.cacheKeyPrefix = cacheKeyPrefix;
        memoizer.argumentsStringifier = argumentsStringifier;

        memoizer.peek = function () { // ...
            return cache.peek(cacheKeyPrefix + argumentsStringifier(Array.prototype.slice.call(arguments)));
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
