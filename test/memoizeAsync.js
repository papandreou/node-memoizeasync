var memoizeAsync = require('../lib/memoizeAsync'),
    LRUCache = require('lru-cache'),
    expect = require('unexpected'),
    passError = require('passerror');

describe('memoizeAsync', function () {
    it('on a zero-param function should keep returning the same result', function (done) {
        var nextNumber = 1,
            memoizedGetNextNumber = memoizeAsync(function getNextNumber(cb) {
                process.nextTick(function () {
                    cb(null, nextNumber++);
                });
            });

        memoizedGetNextNumber(function (err, nextNumber) {
            expect(nextNumber, 'to equal', 1);
            memoizedGetNextNumber(function (err, nextNextNumber) {
                expect(nextNextNumber, 'to equal', 1);
                done();
            });
        });
    });

    it('on a multi-param function should only return the same result when the parameters are the same', function (done) {
        var nextNumber = 1,
            memoizedSumOfOperandsPlusNextNumber = memoizeAsync(function sumOfOperandsPlusNextNumber(op1, op2, cb) {
                process.nextTick(function () {
                    cb(null, op1 + op2 + nextNumber++);
                });
            });

        memoizedSumOfOperandsPlusNextNumber(10, 10, passError(done, function (sumPlusNextNumber) {
            expect(sumPlusNextNumber, 'to equal', 21);
            expect(memoizedSumOfOperandsPlusNextNumber.peek(10, 10)[1], 'to equal', 21);
            memoizedSumOfOperandsPlusNextNumber(10, 10, passError(done, function (sumPlusNextNextNumber) {
                expect(sumPlusNextNextNumber, 'to equal', 21);
                memoizedSumOfOperandsPlusNextNumber(10, 20, passError(done, function (sumPlusNextNextNextNumber) {
                    expect(sumPlusNextNextNextNumber, 'to equal', 32);
                    memoizedSumOfOperandsPlusNextNumber.purge(10, 20);
                    memoizedSumOfOperandsPlusNextNumber(10, 20, passError(done, function (number) {
                        expect(number, 'to equal', 33);
                        memoizedSumOfOperandsPlusNextNumber(10, 10, passError(done, function (number) {
                            expect(number, 'to equal', 21);
                            memoizedSumOfOperandsPlusNextNumber.purgeAll();
                            memoizedSumOfOperandsPlusNextNumber(10, 20, passError(done, function (number) {
                                expect(number, 'to equal', 34);
                                memoizedSumOfOperandsPlusNextNumber(10, 10, passError(done, function (number) {
                                    expect(number, 'to equal', 25);
                                    done();
                                }));
                            }));
                        }));
                    }));
                }));
            }));
        }));
    });

    it('should produce a function that works as a method', function (done) {
        function Counter() {
            this.nextNumber = 1;
        }

        Counter.prototype.getNextNumber = memoizeAsync(function (cb) {
            var that = this;
            process.nextTick(function () {
                cb(null, that.nextNumber++);
            });
        });

        var counter = new Counter();

        counter.getNextNumber(passError(done, function (nextNumber) {
            expect(nextNumber, 'to equal', 1);
            expect(counter.nextNumber, 'to equal', 2);
            counter.getNextNumber(passError(done, function (nextNextNumber) {
                expect(nextNextNumber, 'to equal', 1);
                expect(counter.nextNumber, 'to equal', 2);
                done();
            }));
        }));
    });

    it('should deliver the same result to multiple callbacks that are queued before the result is available', function (done) {
        var nextNumber = 1,
            memoizedGetNextNumber = memoizeAsync(function getNextNumber(cb) {
                process.nextTick(function () {
                    cb(null, nextNumber++);
                });
            });

        var results = [];
        function receiveResultAndProceedIfReady(err, number) {
            results.push(number);
            if (results.length === 2) {
                expect(results[0], 'to equal', 1);
                expect(results[1], 'to equal', 1);
                done();
            }
        }
        memoizedGetNextNumber(receiveResultAndProceedIfReady);
        memoizedGetNextNumber(receiveResultAndProceedIfReady);
    });

    it('should work with a custom argumentsStringifier', function (done) {
        function toCanonicalJson(obj) {
            return JSON.stringify(function traverseAndSortKeys(obj) {
                if (Array.isArray(obj)) {
                    return obj.map(traverseAndSortKeys);
                } else if (typeof obj === 'object' && obj !== null) {
                    var resultObj = {};
                    Object.keys(obj).sort().forEach(function (key) {
                        resultObj[key] = traverseAndSortKeys(obj[key]);
                    });
                    return resultObj;
                } else {
                    return obj;
                }
            }(obj));
        }

        var nextNumber = 1,
            memoizedGetNextNumber = memoizeAsync(function getNextNumber(obj, cb) {
                process.nextTick(function () {
                    cb(null, nextNumber++);
                });
            }, {
                argumentsStringifier: function (args) {
                    return args.map(toCanonicalJson).join('\x1d');
                }
            });

        memoizedGetNextNumber({foo: 'bar', quux: 'baz'}, passError(done, function (nextNumber) {
            expect(nextNumber, 'to equal', 1);
            memoizedGetNextNumber({quux: 'baz', foo: 'bar'}, passError(done, function (nextNumber) {
                expect(nextNumber, 'to equal', 1);
                memoizedGetNextNumber({barf: 'baz'}, passError(done, function (nextNumber) {
                    expect(nextNumber, 'to equal', 2);
                    done();
                }));
            }));
        }));
    });

    it('with a maxAge should recompute the value after an item has become stale', function (done) {
        var nextNumber = 1,
            memoizedGetNextNumber = memoizeAsync(function getNextNumber(cb) {
                process.nextTick(function () {
                    cb(null, nextNumber++);
                });
            }, {maxAge: 10});

        memoizedGetNextNumber(passError(done, function (nextNumber) {
            expect(nextNumber, 'to equal', 1);
            memoizedGetNextNumber(passError(done, function (nextNumber) {
                expect(nextNumber, 'to equal', 1);
                setTimeout(function () {
                    memoizedGetNextNumber(passError(done, function (nextNumber) {
                        expect(nextNumber, 'to equal', 2);
                        done();
                    }));
                }, 15);
            }));
        }));
    });

    it('with a max limit should purge the least recently used result', function (done) {
        var nextNumber = 1,
            memoizedGetNextNumberPlusOtherNumber = memoizeAsync(function getNextNumber(otherNumber, cb) {
                process.nextTick(function () {
                    cb(null, otherNumber + (nextNumber++));
                });
            }, {max: 2});

        memoizedGetNextNumberPlusOtherNumber(1, passError(done, function (nextNumberPlusOne) {
            expect(nextNumberPlusOne, 'to equal', 2);
            memoizedGetNextNumberPlusOtherNumber(2, passError(done, function (nextNumberPlusTwo) {
                expect(nextNumberPlusTwo, 'to equal', 4);
                memoizedGetNextNumberPlusOtherNumber(1, passError(done, function (nextNumberPlusOneAgain) {
                    expect(nextNumberPlusOne, 'to equal', 2);
                    // This will purge memoizedGetNextNumberPlusOtherNumber(2, ...):
                    memoizedGetNextNumberPlusOtherNumber(3, passError(done, function (nextNumberPlusThree) {
                        expect(nextNumberPlusThree, 'to equal', 6);
                        memoizedGetNextNumberPlusOtherNumber(2, passError(done, function (nextNumberPlusTwoAgain) {
                            expect(nextNumberPlusTwoAgain, 'to equal', 6);
                            done();
                        }));
                    }));
                }));
            }));
        }));
    });

    it('with a length function should call the length function with the result callback parameters as regular arguments', function (done) {
        var shouldErrorNextTime = false,
            functionThatErrorsEverySecondTime = function (number, cb) {
                process.nextTick(function () {
                    if (shouldErrorNextTime) {
                        cb(new Error());
                    } else {
                        cb(null, 'the result');
                    }
                    shouldErrorNextTime = !shouldErrorNextTime;
                });
            },
            memoizedFunctionThatErrorsEverySecondTime = memoizeAsync(functionThatErrorsEverySecondTime, {
                length: function (err, result) {
                    return err ? 1 : result.length;
                }
            });
        memoizedFunctionThatErrorsEverySecondTime(1, passError(done, function (result) {
            expect(result, 'to equal', 'the result');
            expect(memoizedFunctionThatErrorsEverySecondTime.cache.length, 'to equal', 10);
            memoizedFunctionThatErrorsEverySecondTime(2, function (err, result2) {
                expect(err, 'to be an', Error);
                expect(result2, 'to equal', undefined);
                expect(memoizedFunctionThatErrorsEverySecondTime.cache.length, 'to equal', 11);
                done();
            });
        }));
    });

    it('should leave unrelated values in the cache when purgeAll is called', function (done) {
        var memoizedAsyncSum = memoizeAsync(function asyncSum(a, b, cb) {
            process.nextTick(function () {
                cb(null, a + b);
            });
        });
        var cache = memoizedAsyncSum.cache;
        memoizedAsyncSum(1, 2, passError(done, function (sum) {
            expect(sum, 'to equal', 3);
            expect(cache.keys().length, 'to equal', 1);
            cache.set('foo', 'bar');
            expect(cache.keys().length, 'to equal', 2);
            memoizedAsyncSum.purgeAll();
            expect(cache.keys().length, 'to equal', 1);
            expect(cache.get('foo'), 'to equal', 'bar');
            done();
        }));
    });

    it('should allow passing an existing lru-cache instance in the options object', function (done) {
        function asyncSum(a, b, cb) {
            process.nextTick(function () {
                cb(null, a + b);
            });
        }
        var cache = new LRUCache(),
            memoizedAsyncSum1 = memoizeAsync(asyncSum, {cache: cache});
        expect(memoizedAsyncSum1.cache, 'to be', cache);

        var memoizedAsyncSum2 = memoizeAsync(asyncSum, {cache: cache});
        expect(memoizedAsyncSum2.cache, 'to be', cache);
        memoizedAsyncSum1(1, 2, passError(done, function (sum) {
            expect(sum, 'to equal', 3);
            expect(cache.keys().length, 'to equal', 1);
            expect(cache.get(memoizedAsyncSum1.cacheKeyPrefix + memoizedAsyncSum1.argumentsStringifier([1, 2])), 'to equal', [null, 3]);
            memoizedAsyncSum2(1, 2, passError(done, function (sum) {
                expect(sum, 'to equal', 3);
                expect(cache.keys().length, 'to equal', 2);
                done();
            }));
        }));
    });

    it('should allow specifying a custom cacheKeyPrefix', function (done) {
        var memoizedAsyncSum = memoizeAsync(function (a, b, cb) {
            process.nextTick(function () {
                cb(null, a + b);
            });
        }, {
            cacheKeyPrefix: 999
        });

        expect(memoizedAsyncSum.cacheKeyPrefix, 'to equal', '999');

        memoizedAsyncSum(1, 2, passError(done, function (sum) {
            expect(sum, 'to equal', 3);
            expect(memoizedAsyncSum.cache.get('999' + memoizedAsyncSum.argumentsStringifier([1, 2])), 'to equal', [null, 3]);
            done();
        }));
    });

    it('should call the memoized function in options.context if specified', function (done) {
        var memoizedFunction = memoizeAsync(function (a, cb) {
            var sum = this.foo + a;
            process.nextTick(function () {
                cb(null, sum);
            });
        }, {context: {foo: 4}});
        memoizedFunction(8, passError(done, function (sum) {
            expect(sum, 'to equal', 12);
            done();
        }));
    });
});
