node-memoizeasync
=================

Yet another memoizer for asynchronous functions.

```javascript
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
}

Foo.prototype.myMethod = memoizeAsync(function (arg1, arg2, cb) {
    console.warn("Cool, this.name works here!", this.name);
    // ...
    cb(null, "That was tough, but I'm done now!");
});
```

To distinguish different invocations (whose results need to be cached
separately) `memoizeAsync` relies on a naive stringification of the
arguments, which is looked up in an internally kept hash. If the
function you're memoizing takes non-primitive arguments you might want
to provide a custom `argumentsStringifier` as a option in the second
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

Installation
------------

Make sure you have node.js and npm installed, then run:

    npm install memoizeasync

License
-------

3-clause BSD license -- see the `LICENSE` file for details.
