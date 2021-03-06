import 'reflect-metadata';
import { asArray } from 'lib/util/collection';
import { container, ServiceType, LifecyclePolicy } from './container';
import { getDesignParamTypes } from 'lib/util/reflect';

export interface DependencyOptions {
    provides?: Array<ServiceType> | ServiceType;
    lifecycle?: LifecyclePolicy;
}

/**
 * A dependency/component that can be dependent on by other component and is registered in the container as factory.
 * @param provides List of components that is provided by this class
 */
export function service<T extends { new(...args: any[]): InstanceType<T> }>(options: DependencyOptions = {}) {
    const lifecycle = options?.lifecycle || LifecyclePolicy.singleton;
    const services = asArray(options?.provides ?? []);

    return function(ctor: T) {
        // Extend the constructor and inject any dependencies not provided
        const paramTypes =  getDesignParamTypes(ctor);

        // @ts-ignore ctor extension is valid here if when there is no intersection
        const classProto = class extends ctor {
            constructor(...args: any[]) {
                for (let i = 0; i < paramTypes.length; i++) {
                    if (args[i] === undefined) {
                        args[i] = container.resolve(paramTypes[i], undefined, ctor);
                    }
                }
                super(...args);
            }
        };

        for (const serviceType of services) {
            container.registerType(serviceType, ctor, lifecycle);
        }

        // Register this dependency in the main container
        // only when the dependency has a name; otherwise it cannot be registered
        if (ctor.name) {
            container.registerType(ctor, ctor, lifecycle);
        }

        // Register dependency metadata on new class ctor
        Reflect.defineMetadata('dependency:provides', services, ctor);
        Reflect.defineMetadata('dependency:lifecycle', lifecycle, ctor);

        // Ensure our newly created dependency shares the same class name as the parent,
        return Object.defineProperty(classProto, 'name', { value: ctor.name, configurable: false, writable: false });
    };
}

export function noResolve() {
    
}