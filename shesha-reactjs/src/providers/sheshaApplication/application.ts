import { FormIdentifier, IDictionary, IErrorInfo, IToolboxComponentGroup } from '@/interfaces';
import { IRouter } from '../shaRouting';
import { ThemeProviderProps } from '../theme';
import { DEFAULT_SHESHA_ROUTES, IHttpHeadersDictionary, ISheshaRoutes } from './contexts';
import IRequestHeaders from '@/interfaces/requestHeaders';
import React, { MutableRefObject, useEffect, useState } from 'react';
import { createNamedContext } from '@/utils/react';
import { FRONTEND_DEFAULT_APP_KEY } from '@/components/settingsEditor/provider/models';
import { IAuthProviderRefProps } from '../auth';
import { FRONT_END_APP_HEADER_NAME } from './models';
import { ISettingsComponentGroup } from '@/designer-components/settingsInput/settingsInput';
import { isDefined } from '@/utils/nullables';
import { setOrDelete } from '@/utils/dictionary';
import { SheshaEventEmitter } from '@shesha-io/core';

export interface IShaApplicationArgs {
  backendUrl: string;
  /**
   * Unique identifier (key) of the front-end application, is used to separate some settings and application parts when use multiple front-ends
   */
  applicationKey?: string | undefined;
  applicationName?: string | undefined;
  accessTokenName?: string | undefined;

  themeProps?: ThemeProviderProps;

  router?: IRouter;
  routes?: ISheshaRoutes;
  getFormUrlFunc?: ((formId: FormIdentifier, isLoggedIn: boolean) => string) | undefined;
  authorizer: MutableRefObject<IAuthProviderRefProps | undefined>;
  buildHttpRequestHeaders?: (() => IHttpHeadersDictionary) | undefined;
}

export type InitializationAction = (application: ISheshaApplicationInstance) => Promise<void>;

export interface ISheshaApplicationInstance {
  backendUrl: string;
  httpHeaders: IHttpHeadersDictionary;
  setRequestHeaders: (headers: IRequestHeaders) => void;

  applicationKey: string | undefined;
  applicationName: string | undefined;

  routes: ISheshaRoutes;

  globalVariables: Record<string, unknown>;
  setGlobalVariables: (values: Record<string, unknown>) => void;

  formDesignerComponentGroups: IToolboxComponentGroup[];
  formDesignerComponentRegistrations: IDictionary<IToolboxComponentGroup[]>;
  registerFormDesignerComponents: (owner: string, components: IToolboxComponentGroup[]) => void;

  settingsComponentGroups: ISettingsComponentGroup[];
  settingsComponentRegistrations: IDictionary<ISettingsComponentGroup[]>;
  registerSettingsComponents: (owner: string, components: ISettingsComponentGroup[]) => void;

  anyOfPermissionsGranted: (permissions: string[]) => boolean;

  init: () => Promise<void>;
  initializationState: ApplicationInitializationState;
  registerInitialization: (uid: string, action: InitializationAction) => void;
  buildHttpRequestHeaders: (() => IHttpHeadersDictionary) | undefined;

  /**
   * Subscribe to state-change notifications emitted by this instance.
   *
   * Framework adapters call this to bridge the framework-agnostic event system
   * with their own reactivity mechanism (e.g. React `useState`).
   *
   * @returns An unsubscribe function — call it when the subscription is no longer needed.
   */
  subscribe: (listener: () => void) => () => void;
}

export type AppInitializationStatus = 'waiting' | 'inprogress' | 'ready' | 'failed';
export interface ApplicationInitializationState {
  status: AppInitializationStatus;
  hint?: string | undefined;
  error?: IErrorInfo | undefined;
}

/**
 * Internal event map for {@link SheshaApplicationInstance}.
 * @internal
 */
interface SheshaApplicationEvents extends Record<string, unknown> {
  /** Fired whenever the instance mutates state that consumers need to react to. */
  change: void;
}

export class SheshaApplicationInstance implements ISheshaApplicationInstance {
  #settingsComponentRegistrations: IDictionary<ISettingsComponentGroup[]>;

  #settingsComponentGroups: ISettingsComponentGroup[];

  #initializationState: ApplicationInitializationState;

  #backendUrl: string;

  #httpHeaders: IHttpHeadersDictionary;

  #applicationKey: string | undefined;

  #applicationName: string | undefined;

  #routes: ISheshaRoutes;

  #getFormUrlFunc: ((formId: FormIdentifier, isLoggedIn: boolean) => string) | undefined;

  #buildHttpRequestHeaders: (() => IHttpHeadersDictionary) | undefined;

  #authorizer: MutableRefObject<IAuthProviderRefProps | undefined>;

  #formDesignerComponentRegistrations: IDictionary<IToolboxComponentGroup[]>;

  #formDesignerComponentGroups: IToolboxComponentGroup[];

  #globalVariables: Record<string, unknown>;

  /**
   * Framework-agnostic event emitter — replaces the previous `#rerender` callback.
   * Any framework adapter (React, Vue, …) that needs to react to state changes
   * should subscribe via {@link subscribe}.
   */
  readonly #emitter = new SheshaEventEmitter<SheshaApplicationEvents>();

  get backendUrl(): string {
    return this.#backendUrl;
  }

  get applicationKey(): string | undefined {
    return this.#applicationKey;
  }

  get applicationName(): string | undefined {
    return this.#applicationName;
  }

  get getFormUrlFunc(): ((formId: FormIdentifier, isLoggedIn: boolean) => string) | undefined {
    return this.#getFormUrlFunc;
  }

  get formDesignerComponentGroups(): IToolboxComponentGroup[] {
    return this.#formDesignerComponentGroups;
  }

  get formDesignerComponentRegistrations(): IDictionary<IToolboxComponentGroup[]> {
    return this.#formDesignerComponentRegistrations;
  }

  get routes(): ISheshaRoutes {
    return this.#routes;
  }

  get httpHeaders(): IHttpHeadersDictionary {
    return this.#httpHeaders;
  }

  get buildHttpRequestHeaders(): (() => IHttpHeadersDictionary) | undefined {
    return this.#buildHttpRequestHeaders;
  }

  constructor(args: IShaApplicationArgs) {
    this.#initializationState = {
      status: 'waiting',
    };
    this.#backendUrl = args.backendUrl;
    this.#applicationKey = args.applicationKey ?? FRONTEND_DEFAULT_APP_KEY;
    this.#applicationName = args.applicationName;
    this.#routes = args.routes ?? DEFAULT_SHESHA_ROUTES;
    this.#getFormUrlFunc = args.getFormUrlFunc;
    this.#buildHttpRequestHeaders = args.buildHttpRequestHeaders;
    this.#formDesignerComponentRegistrations = {};
    this.#formDesignerComponentGroups = [];

    this.#authorizer = args.authorizer;

    this.#globalVariables = {};
    this.#httpHeaders = { [FRONT_END_APP_HEADER_NAME]: this.#applicationKey };

    this.#settingsComponentRegistrations = {};
    this.#settingsComponentGroups = [];
  }

  /**
   * Subscribe to state-change events.
   *
   * The React adapter calls this inside a `useEffect` so that it can call
   * `forceUpdate` whenever the instance mutates, without the class needing
   * any React import.
   *
   * @returns An unsubscribe function.
   */
  subscribe = (listener: () => void): (() => void) => {
    return this.#emitter.on('change', listener);
  };

  /** Notify all subscribers that state has changed. */
  #notifyChange = (): void => {
    this.#emitter.emit('change', undefined);
  };

  #initializationActions: Record<string, InitializationAction> = {};

  registerInitialization = (uid: string, action: InitializationAction): void => {
    this.#initializationActions[uid] = action;
  };

  get initializationState(): ApplicationInitializationState {
    return this.#initializationState;
  }

  init = async (): Promise<void> => {
    this.#initializationState = { status: 'inprogress', hint: 'Initializing...', error: undefined };
    this.#notifyChange();

    try {
      // do initialization actions...
      // wait all dependencies
      for (const uid in this.#initializationActions) {
        if (!this.#initializationActions[uid]) continue;
        const action = this.#initializationActions[uid];
        await action(this);
      }

      this.#initializationState = { status: 'ready', hint: undefined };
      this.#notifyChange();
    } catch (error) {
      console.error('Application initialization failed', error);
      this.#initializationState = { status: 'failed', error: error as IErrorInfo };
      this.#notifyChange();
    }
  };

  get settingsComponentGroups(): ISettingsComponentGroup[] {
    return this.#settingsComponentGroups;
  }

  get settingsComponentRegistrations(): IDictionary<ISettingsComponentGroup[]> {
    return this.#settingsComponentRegistrations;
  }

  setRequestHeaders = (headers: IRequestHeaders): void => {
    const newHeaders = {
      ...this.#httpHeaders,
      ...this.#buildHttpRequestHeaders?.(),
      ...headers,
    };
    setOrDelete(newHeaders, FRONT_END_APP_HEADER_NAME, this.#applicationKey);

    this.#httpHeaders = newHeaders;
    this.#notifyChange();
  };

  get globalVariables(): Record<string, unknown> {
    return this.#globalVariables;
  }

  setGlobalVariables = (values: Record<string, unknown>): void => {
    this.#globalVariables = { ...this.#globalVariables, ...values };
    this.#notifyChange();
  };

  anyOfPermissionsGranted = (permissions: string[]): boolean => {
    if (permissions.length === 0) return true;

    const authorizer = this.#authorizer.current?.anyOfPermissionsGranted;
    return isDefined(authorizer) && authorizer(permissions);
  };

  registerFormDesignerComponents = (owner: string, components: IToolboxComponentGroup[]): void => {
    const registrations = { ...this.#formDesignerComponentRegistrations, [owner]: components };
    const componentGroups: IToolboxComponentGroup[] = [];
    for (const key in registrations) {
      if (registrations.hasOwnProperty(key) && registrations[key]) componentGroups.push(...registrations[key]);
    }
    this.#formDesignerComponentRegistrations = registrations;
    this.#formDesignerComponentGroups = componentGroups;
    this.#notifyChange();
  };

  registerSettingsComponents = (owner: string, components: ISettingsComponentGroup[]): void => {
    const registrations = { ...this.#settingsComponentRegistrations, [owner]: components };
    const componentGroups: ISettingsComponentGroup[] = [];
    for (const key in registrations) {
      if (registrations.hasOwnProperty(key) && registrations[key]) {
        componentGroups.push(...registrations[key]);
      }
    }
    this.#settingsComponentRegistrations = registrations;
    this.#settingsComponentGroups = componentGroups;
    this.#notifyChange();
  };
}

/**
 * React hook that creates and manages a {@link SheshaApplicationInstance}.
 *
 * The instance itself has no React dependency — it emits change events via
 * {@link SheshaEventEmitter}. This hook subscribes to those events and
 * triggers a React re-render whenever the instance notifies subscribers.
 */
export const useSheshaApplicationInstance = (args: IShaApplicationArgs): ISheshaApplicationInstance => {
  const [, forceUpdate] = React.useState({});
  const [appInstance] = useState<ISheshaApplicationInstance>(
    () => new SheshaApplicationInstance(args) satisfies ISheshaApplicationInstance,
  );

  useEffect(() => {
    // Subscribe to framework-agnostic change events and bridge them to React.
    return appInstance.subscribe(() => forceUpdate({}));
  }, [appInstance]);

  return appInstance;
};

export const SheshaApplicationInstanceContext = createNamedContext<ISheshaApplicationInstance | undefined>(
  undefined,
  'SheshaApplicationInstanceContext',
);

