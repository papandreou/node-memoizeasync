node-memoizeasync
=================

Yet another memoizer for asynchronous functions.

[![NPM version](https://badge.fury.io/js/memoizeasync.png)](http://badge.fury.io/js/memoizeasync)
[![Build Status](https://travis-ci.org/papandreou/node-memoizeasync.svg?branch=master)](https://travis-ci.org/papandreou/node-memoizeasync)
[![Coverage Status](https://coveralls.io/repos/papandreou/node-memoizeasync/badge.png)](https://coveralls.io/r/papandreou/node-memoizeasync)
[![Dependency Status](https://david-dm.org/papandreou/node-memoizeasync.png)](https://david-dm.org/papandreou/node-memoizeasync)

```javascript
var memoizeAsync = require('memoizeasync');

function myExpensiveComputation(arg1, arg2, cb) {
   // ...
   cb(null, result);
}

var memoized = memoizeAsync(myExpensiveComputation);
```

Now `memoized` works exactly like `myExpensiveComputation`, except that
the actual computation is only performed once for each unique set of
arguments (apart from the callback):

```javascript
memoized(42, 100, function (err, result) {
    // Got the result!

    memoized(42, 100, function (err, result) {
        // Got the same result, and much faster this time!
    });
});
```

The function returned by `memoizeAsync` invokes the wrapped function
in the context it's called in itself, so `memoizeAsync` even works for
memoizing a method that has access to instance variables:

```javascript
function Foo(name) {
    this.name = name;

    this.myMethod = memoizeAsync(function (arg1, arg2, cb) {
        console.log("Cool, this.name works here!", this.name);
        // ...
        cb(null, "That was tough, but I'm done now!");
    });
}
```

(Unfortunately setting `Foo.prototype.myMethod = memoizeSync(...)`
wouldn't work as the memoizer would be shared among all instances of
`Foo`).

To distinguish different invocations (whose results need to be cached
separately) `memoizeAsync` relies on a naive stringification of the
arguments, which is looked up in an internally kept hash. If the
function you're memoizing takes non-primitive arguments you might want
to provide a custom `argumentsStringifier` as an option in the second
argument to `memoizeAsync`. Otherwise all object arguments will be
considered equal because they stringify to `[object Object]`:

```javascript
var memoized = memoizeAsync(function functionToMemoize(obj, cb) {
    // ...
    cb(null, Object.keys(obj).join(''));
}, {
    argumentsStringifier: function (args) {
       return args.map(function (arg) {return JSON.stringify(arg);}).join(",");
    }
);

memoized({foo: 'bar'}, function (err, result) {
    // result === 'foo'
    memoized({quux: 'baz'}), function (err, result) {
        // result === 'quux'
    });
});
```

Had the custom `argumentsStringifier` not been provided, `result`
would have been `foo` both times.

Check out <a
href="https://github.com/papandreou/node-memoizeasync/blob/master/test/memoizeAsync.js">the
custom argumentsStringifier test</a> for another example.


### Purging and expiring memoized values ###

You can forcefully clear a specific memoized value using the `purge`
method on the memoizer:

```javascript
var memoized = memoizeAsync(function functionToMemoize(foo, cb) {
    // ...
    cb(null, theResult);
});
memoized(123, function (err, value) {
    memoized.purge(123);
});
```

`memoized.purgeAll()` clears all memoized results.

You can also specify a custom ttl (in milliseconds) on the memoized
results:

```javascript
var memoized = memoizeAsync(function functionToMemoize(cb) {
    // ...
    cb(null, theResult);
}, {maxAge: 1000});
```

In the above example the memoized value will be considered stale one
second after it has been computed, and it will be recomputed next time
`memoizeAsync` is invoked with the same arguments.

`memoizeAsync` uses <a
href="https://github.com/isaacs/node-lru-cache">node-lru-cache</a> to
store the memoized values, and it accepts the same parameters in the
`options` object. If provided, the `length` function will be wrapped
so it's called with the same arguments as the callback to the memoized
function:

```javascript
var fs = require('fs'),
    memoizedFsReadFile = memoizeAsync(fs.readFile, {
        max: 1000000,
        length: function (err, body) {
            return body.length;
        },
        maxAge: 1000
    });
```

The LRU instance is exposed in the `cache` property of the memoized
function in case you need to access it. Note that the values stored in
the cache are arrays of parameters provided to the callback by the
memoized function. In most cases that will be `[err, result]`:


```javascript
var numMemoizedErrors = 0;
memoized.cache.values().forEach(function (resultCallbackParams) {
    if (resultCallbackParams[0]) {
        numMemoizedErrors += 1;
    }
});
```

Besides the maxAge option that is provided by the LRU module, the
memoizer is augmented with a refreshAge option. When the memoizer
is asked for a value which is post its refreshAge, it will start
fetching a new value, while in the meantime it will return the
value.

```javascript
var memoizedFsReadFile = memoizeAsync(slowAsyncMethod, {
        refreshAge: 900,
        maxAge: 1000
    });
```

Error handling
--------------

If a memoized function passes an error to its callback, memoizeAsync will catch
and rethrow it, so memoizeAsync is transparent in that regard. By default,
errors won't be saved in the cache, so the original function will be run
again on the next invocation of the memoized function. If you want errors
to be memoized as well, set the `errors` option to `true`.

Installation
------------

Make sure you have node.js and npm installed, then run:

    npm install memoizeasync

Browser compatibility
---------------------

`memoizeAsync` uses the UMD wrapper, so it should also work in
browsers. You should also have the <a
href="https://github.com/isaacs/node-lru-cache">node-lru-cache</a>
included:

```html
<script src="lru-cache.js"></script>
<script src="memoizeAsync.js"></script>
<script>
    var memoizedFunction = memoizeAsync(function (cb) {
        // ...
    });
</script>
```

`lru-cache` uses `Object.defineProperty` and doesn't include an UMD
wrapper, but if you define a `shims` config it should be possible to
get it memoizeAsync working with require.js, at least in newer browsers.

License
-------

3-clause BSD license -- see the `LICENSE` file for details.
