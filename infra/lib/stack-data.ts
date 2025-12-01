import type { Env, } from '@types';

export class StackData {

  stackEnv: Env;

  constructor( stackEnv: Env ) {

    this.stackEnv = stackEnv;

  }

}