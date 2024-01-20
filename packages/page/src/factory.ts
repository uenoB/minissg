const init_: unique symbol = Symbol('init_')

export interface Init<This extends Product> {
  // the following function must be bivariant.
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  init(arg: { [init_]?: This }): void
}

export class Factory<This extends Product, Args extends unknown[] = never> {
  // `This` can be an arbitrary subclass of Product.
  // Factory allows to initialize an instance of `This` from outside of
  // its constructor when Product.constructor is called.
  constructor(
    readonly This: new (arg: Init<This>, ...args: Args) => This,
    readonly args: Args
  ) {}

  create(initialize: (self: This) => void): This {
    let init: Init<This> | undefined = {
      init({ [init_]: self }: { [init_]?: This }) {
        if (init == null) throw Error('outside of Factory.create')
        if (self == null) throw Error('inproper call of init')
        initialize(self)
      }
    }
    try {
      return new this.This(init, ...this.args)
    } finally {
      init = undefined
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Product {
  constructor(arg: Init<Product>) {
    // this is the only place to call Factory.initialize appropriately
    // because `init_` is not exported.  Factory.initialize can be called
    // anyway from other places but it is impossible to set `[init_]`
    // property at there.
    // thanks to bivariance, regardless of actual class of `this` and `arg`,
    // the following call is always typechecked.
    arg.init({ [init_]: this })
  }
}
