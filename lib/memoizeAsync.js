(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory(require('lru-cache'));
    } else if (typeof define === 'function' && define.amd) {
        define(['LRUCache'], factory);
    } else {
        root.memoizeAsync = factory(root.LRUCache);
    }
}(this, function (LRU) {
    return function memoizeAsync(lambda, options) {
        options = options || {};
        var argumentsStringifier = options.argumentsStringifier || function (args) {
                return args.map(String).join('\x1d'); // Group separator
            },
            waitingCallbacksByStringifiedArguments = {},
            lruOptions = {};

        for (var propertyName in options) {
            if (Object.prototype.hasOwnProperty.call(options, propertyName)) {
                var value = options[propertyName];
                if (propertyName === 'length') {
                    // Make sure that the 'length' function gets called with the resultCallbackParams as actual parameters
                    // so it matches the signature of the callback:
                    lruOptions.length = function (resultCallbackParams) {
                        return value.apply(this, resultCallbackParams);
                    };
                } else if (propertyName !== 'argumentsStringifier') {
                    lruOptions[propertyName] = value;
                }
            }
        }
        var cache = new LRU(lruOptions);

        function memoizer() { // ...
            var that = this, // In case you want to create a memoized method
                args = Array.prototype.slice.call(arguments),
                cb = args.pop(),
                stringifiedArguments = String(argumentsStringifier(args)), // In case the function returns a non-string
                resultCallbackParams = cache.get(stringifiedArguments);

            if (typeof resultCallbackParams !== 'undefined') {
                process.nextTick(function () {
                    cb.apply(that, resultCallbackParams);
                });
            } else if (waitingCallbacksByStringifiedArguments[stringifiedArguments]) {
                waitingCallbacksByStringifiedArguments[stringifiedArguments].push(cb);
            } else {
                waitingCallbacksByStringifiedArguments[stringifiedArguments] = [cb];
                lambda.apply(that, args.concat(function () { // ...
                    var resultCallbackParams = arguments,
                        waitingCallbacks = waitingCallbacksByStringifiedArguments[stringifiedArguments];
                    cache.set(stringifiedArguments, resultCallbackParams);
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

        memoizer.peek = function () { // ...
            return cache.peek(argumentsStringifier(Array.prototype.slice.call(arguments)));
        };

        memoizer.purge = function () { // ...
            cache.del(argumentsStringifier(Array.prototype.slice.call(arguments)));
        };

        memoizer.purgeAll = function () {
            cache.reset();
        };

        return memoizer;
    };
}));
