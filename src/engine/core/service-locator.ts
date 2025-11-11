import { Container } from '@engine/core/container';
import { Singletons } from '@engine/core/interfaces';

export class ServiceLocator {
  static readonly getInstance = () => Container.getInstance();
  static readonly get = <T>(singleton: Singletons): T | null => Container.getInstance().get<T>(singleton);
}
