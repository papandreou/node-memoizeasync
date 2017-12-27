/*global describe, it, beforeEach, afterEach*/
var memoizeAsync = require('../lib/memoizeAsync'),
    LRUCache = require('lru-cache'),
    expect = require('unexpected').clone().installPlugin(require('unexpected-sinon')),
    passError = require('passerror'),
    async = require('async'),
    sinon = require('sinon');

describe('memoizeAsync', function () {
    describe('on a zero-param function', function () {
        it('should keep returning the same result', function (done) {
            var nextNumber = 1,
                memoizedGetNextNumber = memoizeAsync(function getNextNumber(cb) {
                    process.nextTick(function () {
                        cb(null, nextNumber);
                        nextNumber += 1;
                    });
                });

            memoizedGetNextNumber(function (err, nextNumber) {
                expect(err, 'to be falsy');
                expect(nextNumber, 'to equal', 1);
                memoizedGetNextNumber(function (err, nextNextNumber) {
                    expect(err, 'to be falsy');
                    expect(nextNextNumber, 'to equal', 1);
                    done();
                });
            });
        });
    });

    describe('on a multi-param function', function () {
        it('should only return the same result when the parameters are the same', function (done) {
            var nextNumber = 1,
                memoizedSumOfOperandsPlusNextNumber = memoizeAsync(function sumOfOperandsPlusNextNumber(op1, op2, cb) {
                    process.nextTick(function () {
                        cb(null, op1 + op2 + nextNumber);
                        nextNumber += 1;
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
    });

    it('should produce a function that works as a method', function (done) {
        function Counter() {
            this.nextNumber = 1;
        }

        Counter.prototype.getNextNumber = memoizeAsync(function (cb) {
            var that = this;
            process.nextTick(function () {
                cb(null, that.nextNumber);
                that.nextNumber += 1;
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
                    cb(null, nextNumber);
                    nextNumber += 1;
                });
            });

        var results = [];
        function receiveResultAndProceedIfReady(err, number) {
            expect(err, 'to be falsy');
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

    describe('with a custom argumentsStringifier', function () {
        it('should use it instead of String(...)', function (done) {
            function toCanonicalJson(obj) {
                return JSON.stringify((function traverseAndSortKeys(obj) {
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
                }(obj)));
            }

            var nextNumber = 1,
                memoizedGetNextNumber = memoizeAsync(function getNextNumber(obj, cb) {
                    process.nextTick(function () {
                        cb(null, nextNumber);
                        nextNumber += 1;
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

        describe('that returns false', function () {
            it('should bypass the memoization', function (done) {
                var nextNumber = 1,
                    memoizedGetNextNumber = memoizeAsync(function getNextNumber(str, cb) {
                        process.nextTick(function () {
                            cb(null, nextNumber);
                            nextNumber += 1;
                        });
                    }, {
                        argumentsStringifier: function () {
                            return false;
                        }
                    });

                memoizedGetNextNumber('foo', passError(done, function (nextNumber) {
                    expect(nextNumber, 'to equal', 1);
                    memoizedGetNextNumber('foo', passError(done, function (nextNumber) {
                        expect(nextNumber, 'to equal', 2);
                        done();
                    }));
                }));
            });
        });
    });

    describe('with a maxAge', function () {
        it('should recompute the value after an item has become stale', function (done) {
            var nextNumber = 1,
                memoizedGetNextNumber = memoizeAsync(function getNextNumber(cb) {
                    process.nextTick(function () {
                        cb(null, nextNumber);
                        nextNumber += 1;
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
    });

    describe('with a max limit', function () {
        it('with a max limit should purge the least recently used result', function (done) {
            var nextNumber = 1,
                memoizedGetNextNumberPlusOtherNumber = memoizeAsync(function getNextNumber(otherNumber, cb) {
                    process.nextTick(function () {
                        cb(null, otherNumber + nextNumber);
                        nextNumber += 1;
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
    });

    describe('with a length function', function () {
        it('should call the length function with the result callback parameters as regular arguments', function (done) {
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
                    },
                    errors: true
                });
            memoizedFunctionThatErrorsEverySecondTime(1, passError(done, function (result) {
                expect(result, 'to equal', 'the result');
                expect(memoizedFunctionThatErrorsEverySecondTime.cache.length, 'to equal', 10);
                memoizedFunctionThatErrorsEverySecondTime(2, function (err, result2) {
                    expect(err, 'to be an', Error);
                    expect(result2, 'to be undefined');
                    expect(memoizedFunctionThatErrorsEverySecondTime.cache.length, 'to equal', 11);
                    done();
                });
            }));
        });
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

    it('should not memoize errors per default', function (done) {
        var memoizedFunction = memoizeAsync(function (cb) {
            process.nextTick(function () {
                cb(new Error('foo'));
            });
        });
        memoizedFunction(function (err) {
            expect(err, 'to be an', Error);
            expect(err.message, 'to equal', 'foo');
            memoizedFunction(function (err2) {
                expect(err2, 'to be an', Error);
                expect(err2.message, 'to equal', 'foo');
                expect(err2, 'not to be', err);
                done();
            });
        });
    });

    it('should memoize errors if the `errors` option is set to true', function (done) {
        var memoizedFunction = memoizeAsync(function (cb) {
            process.nextTick(function () {
                cb(new Error('foo'));
            });
        }, {errors: true});
        memoizedFunction(function (err) {
            expect(err, 'to be an', Error);
            expect(err.message, 'to equal', 'foo');
            memoizedFunction(function (err2) {
                expect(err2, 'to be an', Error);
                expect(err2.message, 'to equal', 'foo');
                expect(err2, 'to be', err);
                done();
            });
        });
    });

    describe('with refreshAge', function () {
        var clock;
        var currentTick = 0;

        function gotoTick(n) {
            var toTick = n - currentTick;
            currentTick = n;
            clock.tick(toTick);
        }

        beforeEach(function () {
            currentTick = 0;
            clock = sinon.useFakeTimers();
        });
        afterEach(function () {
            clock.restore();
        });
        it('should refresh async but return stale value immediately', function (done) {
            var nextNumber = 1,
                method = sinon.spy(function getNextNumber(cb) {
                    setTimeout(function () {
                        cb(null, nextNumber);
                        nextNumber += 1;
                    }, 5);
                }),
                memoizedGetNextNumber = memoizeAsync(method, { maxAge: 20, refreshAge: 10 });

            async.series([
                function (callback) {
                    // initial call
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 1);
                        expect(method, 'was called once');
                        gotoTick(10);
                        callback();
                    }));
                    // going to tick 6 to allow it to finish
                    gotoTick(6);
                },
                function (callback) {
                    // still below refreshAge
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 1);
                        expect(method, 'was called once');
                        gotoTick(17);
                        callback();
                    }));
                },
                function (callback) {
                    // above refreshAge below maxAge immediate result
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 1);
                        expect(method, 'was called twice');
                        gotoTick(27);
                        callback();
                    }));
                },
                function (callback) {
                    // above initial maxAge but immediate result because refresh
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 2);
                        expect(method, 'was called twice');
                        callback();
                    }));
                }
            ], done);
        });

        it('should allow updating refreshTime on the fly', function (done) {
            // Reusing the test from above to assert that you can change the refreshAge on the fly.
            var nextNumber = 1,
                method = sinon.spy(function getNextNumber(cb) {
                    setTimeout(function () {
                        cb(null, nextNumber);
                        nextNumber += 1;
                    }, 5);
                }),
                memoizedGetNextNumber = memoizeAsync(function (callback) {
                    method(callback);
                    memoizedGetNextNumber.refreshAge = 10;
                }, { maxAge: 20, refreshAge: 100 });

            async.series([
                function (callback) {
                    // initial call
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 1);
                        expect(method, 'was called once');
                        gotoTick(10);
                        callback();
                    }));
                    // going to tick 6 to allow it to finish
                    gotoTick(6);
                },
                function (callback) {
                    // still below refreshAge
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 1);
                        expect(method, 'was called once');
                        gotoTick(17);
                        callback();
                    }));
                },
                function (callback) {
                    // above refreshAge below maxAge immediate result
                    memoizedGetNextNumber(passError(callback, function (nextNumber) {
                        expect(nextNumber, 'to be', 1);
                        expect(method, 'was called twice');
                        callback();
                    }));
                }
            ], done);
        });
    });

    describe('#getTtl', function () {
        it('should return -1 for a non-existent value', function () {
            expect(memoizeAsync(setImmediate).getTtl(), 'to equal', -1);
        });

        it('should return undefined when there is no maxAge', function (done) {
            var memoizedAsyncSum = memoizeAsync(function (a, b, cb) {
                process.nextTick(function () {
                    cb(null, a + b);
                });
            });

            memoizedAsyncSum(1, 2, function () {
                expect(memoizedAsyncSum.getTtl(1, 2), 'to be undefined');
                done();
            });
        });

        it('should return the ttl in milliseconds when a maxAge is defined', function (done) {
            var memoizedAsyncSum = memoizeAsync(function (a, b, cb) {
                process.nextTick(function () {
                    cb(null, a + b);
                });
            }, {
                maxAge: 1000
            });
            memoizedAsyncSum(1, 2, function () {
                expect(memoizedAsyncSum.getTtl(1, 2), 'to be a number');
                done();
            });
        });
    });

    describe('#getAge', function () {
        it('should return -1 for a non-existent value', function () {
            expect(memoizeAsync(setImmediate).getAge(), 'to equal', -1);
        });

        it('should return undefined when there is no maxAge', function (done) {
            var memoizedAsyncSum = memoizeAsync(function (a, b, cb) {
                process.nextTick(function () {
                    cb(null, a + b);
                });
            });
            memoizedAsyncSum(1, 2, function () {
                expect(memoizedAsyncSum.getAge(1, 2), 'to be undefined');
                done();
            });
        });

        it('should return the age in milliseconds when a maxAge is defined', function (done) {
            var memoizedAsyncSum = memoizeAsync(function (a, b, cb) {
                process.nextTick(function () {
                    cb(null, a + b);
                });
            }, {
                maxAge: 1000
            });
            memoizedAsyncSum(1, 2, function () {
                expect(memoizedAsyncSum.getAge(1, 2), 'to be a number');
                done();
            });
        });
    });

    it('should keep serving the stale value after starting a refresh and not call the underlying method again', function () {
        var nextNumber = 1,
            method = sinon.spy(function getNextNumber(cb) {
                setTimeout(function () {
                    cb(null, nextNumber);
                    nextNumber += 1;
                }, 5);
            }),
            memoizedGetNextNumber = memoizeAsync(function (callback) {
                method(callback);
            }, { maxAge: 100, refreshAge: 50 });

        return expect(memoizedGetNextNumber, 'to call the callback without error')
            .spread(function (result) {
                expect(result, 'to equal', 1);
                expect(method, 'was called once');
            })
            .delay(55)
            .then(function () {
                return expect.promise.all([
                    expect(memoizedGetNextNumber, 'to call the callback without error'),
                    expect(memoizedGetNextNumber, 'to call the callback without error')
                ]);
            })
            .then(function (result) {
                expect(result, 'to equal', [ [ 1 ], [ 1 ] ]);
                expect(method, 'was called twice');
            })
            .delay(10)
            .then(function () {
                expect(memoizedGetNextNumber.peek(), 'to equal', [ null, 2 ]);
            });
    });
});
