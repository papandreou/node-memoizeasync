module.exports = function memoizeAsync(lambda, options) {
    options = options || {};
    var argumentsStringifier = options.argumentsStringifier || function (args) {
            return args.map(String).join('\x1d'); // Group separator
        },
        ttl = options.ttl,
        waitingCallbacksByStringifiedArguments = {},
        resultCallbackParamsByStringifiedArguments = {},
        expiryTimestampByStringifiedArguments = {};

    function memoizer() { // ...
        var that = this, // In case you want to create a memoized method
            args = Array.prototype.slice.call(arguments),
            cb = args.pop(),
            stringifiedArguments = String(argumentsStringifier(args)); // In case the function returns a non-string

        if (stringifiedArguments in resultCallbackParamsByStringifiedArguments && (typeof ttl === 'undefined' || expiryTimestampByStringifiedArguments[stringifiedArguments] >= Date.now())) {
            var resultCallbackParams = resultCallbackParamsByStringifiedArguments[stringifiedArguments];
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
                resultCallbackParamsByStringifiedArguments[stringifiedArguments] = resultCallbackParams;
                if (typeof ttl !== 'undefined') {
                    expiryTimestampByStringifiedArguments[stringifiedArguments] = Date.now() + ttl;
                }
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

    memoizer.purge = function () { // ...
        var stringifiedArguments = argumentsStringifier(Array.prototype.slice.call(arguments));
        delete resultCallbackParamsByStringifiedArguments[stringifiedArguments];
        delete expiryTimestampByStringifiedArguments[stringifiedArguments];
    };

    memoizer.purgeAll = function () {
        resultCallbackParamsByStringifiedArguments = {};
        expiryTimestampByStringifiedArguments = {};
    };

    return memoizer;
};
