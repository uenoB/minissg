# @minissg/memo

This package provides the following memoization facilities:

* [`Delay` class](#delay-class)
* [`Memo` class](#memoization)
* [`Ivar` class](#ivar-class)

This package is designed primarily for Minissg but does not depend on it:
it can be used in any other environment.

This is a part of
[monorepo of Minissg](https://github.com/uenoB/vite-plugin-minissg).

## `Delay` class

```typescript
declare class Delay<X> implements PromiseLike<X> {
  private constructor(value: Awaitable<X>);
  get value(): X;
  wrap<Y = X, Z = never>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Delay<Y | Z>;
  then<Y = X, Z = never>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Promise<Y | Z>;
  static resolve(): Delay<void>;
  static resolve<X>(value: Awaitable<X>): Delay<Awaited<X>>;
  static reject<X = never>(value?: unknown): Delay<X>;
  static lazy<X>(func: () => Awaitable<X>): Delay<X>;
}
```

The `Delay` class is the same as `Promise` except that `Delay` has `value`
method that allows users to obtain the result of promise without `await` or
`then`.
If `value` is called but the promise has not yet fulfilled, an `Promise`
that needs to be fulfilled to get the value is thrown.
This behavior is intended to fit with React's Suspense.

The role and behavior of `then`, `resolve`, and `reject` methods is
the same as `Promise` except that, if `resolve` and `reject` is given a
non-thenable value, the created Delay object is fulfilled immediately without
creating new promise.

`Delay`'s constructor is not publicly available in TypeScript
but works in JavaScript similarly to `Delay.resolve`.

The `wrap` method is simlar to `then` but, if the Delay object has already
fulfilled, the given callback is called immediately without creating new
promise.

`Delay.lazy(() => ...)` creates a `Delay` object whose value is the result of
the given function, but the execution of the given function is postponed until
the created `Delay` object is `await`-ed.

## `Memo` class

```typescript
interface Context {
  parent?: Readonly<Context> | undefined
}

declare class Memo<X> {
    get(keys: unknown[]): Delay<X> | undefined;
    set(keys: unknown[], newValue: () => Awaitable<X>): Delay<X>;
    memo<Args extends unknown[], This extends object | Void = void>(
      func: (this: This, ...args: Args) => Awaitable<X>
    ): (this: This, ...args: Args) => Delay<X>;
    static inContext<Ret, Args extends unknown[]>(
      store: Readonly<Context>,
      callback: (...args: Args) => Ret,
      ...args: Args
    ): Ret;
}
```

The `Memo` class provides a storage for context-dependent memoization.

`Memo.inContext(context, () => ...)` sets the memoization context to
`context` within the evaluation of the given callback function.

The `set(keys, () => ...)` method associates the return value of the given
function with `keys` in the current context.
If `keys` has already been associated with a value in the current context
or one of its ancestor context, the given function is not called and the
`set` method returns the associated value instead.

The `get(keys)` method returns the value associated with `keys` in the
current context or one of its ancestor context.

The `memo` method is a utility to add memoization facility to a function.

## `Ivar` class

``` typescript
declare class Ivar<X> {
  constructor();
  get(): Delay<X>;
  set(newValue: () => Awaitable<X>): Delay<X>;
}
```

Ivar is a variable that can be assigned only once.

`new Ivar()` creates a new Ivar.

The `get` method returns a Delay that has the value of the Ivar.
The Delay object is not fulfilled until `set` method is called.

The `set` method sets Ivar to the return value of the given function
if the Ivar is not set.
If the Ivar has already set, the given function is simply ignored.

Both the `get` and `set` method return an identical Delay object.
