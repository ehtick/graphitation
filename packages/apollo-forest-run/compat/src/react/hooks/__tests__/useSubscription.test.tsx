import React from 'react';
import { renderHook } from '@testing-library/react-hooks';
import gql from 'graphql-tag';

import { ApolloClient, ApolloLink, concat } from '../../../core';
import { InMemoryCache as Cache } from '../../../cache';
import { ApolloProvider } from '../../context';
import { MockSubscriptionLink } from '../../../testing';
import { useSubscription } from '../useSubscription';

describe('useSubscription Hook', () => {
  it('should handle a simple subscription properly', async () => {
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const results = ['Audi', 'BMW', 'Mercedes', 'Hyundai'].map(make => ({
      result: { data: { car: { make } } }
    }));

    const link = new MockSubscriptionLink();
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false })
    });


    const { result, waitForNextUpdate } = renderHook(
      () => useSubscription(subscription),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(undefined);
    setTimeout(() => link.simulateResult(results[0]));
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(results[0].result.data);
    setTimeout(() => link.simulateResult(results[1]));
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(results[1].result.data);
    setTimeout(() => link.simulateResult(results[2]));
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(results[2].result.data);
    setTimeout(() => link.simulateResult(results[3]));
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(results[3].result.data);
  });

  it('should cleanup after the subscription component has been unmounted', async () => {
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const results = [
      {
        result: { data: { car: { make: 'Pagani' } } }
      }
    ];

    const link = new MockSubscriptionLink();
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false })
    });

    const onSubscriptionData = jest.fn();
    const { result, unmount, waitForNextUpdate } = renderHook(
      () => useSubscription(subscription, {
        onSubscriptionData,
      }),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(undefined);
    setTimeout(() => link.simulateResult(results[0]));
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(results[0].result.data);
    setTimeout(() => {
      expect(onSubscriptionData).toHaveBeenCalledTimes(1);
      // After the component has been unmounted, the internal
      // ObservableQuery should be stopped, meaning it shouldn't
      // receive any new data (so the onSubscriptionDataCount should
      // stay at 1).
      unmount();
      link.simulateResult(results[0]);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onSubscriptionData).toHaveBeenCalledTimes(1);
  });

  it('should never execute a subscription with the skip option', async () => {
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const onSetup = jest.fn();
    const link = new MockSubscriptionLink();
    link.onSetup(onSetup);
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false })
    });

    const onSubscriptionData = jest.fn();
    const { result, unmount, waitForNextUpdate, rerender } = renderHook(
      ({ variables }) => useSubscription(subscription, {
        variables,
        skip: true,
        onSubscriptionData,
      }),
      {
        initialProps: {
          variables: {
            foo: 'bar'
          }
        },
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(undefined);

    rerender({ variables: { foo: 'bar2' }});
    await expect(waitForNextUpdate({ timeout: 20 }))
      .rejects.toThrow('Timed out');

    expect(onSetup).toHaveBeenCalledTimes(0);
    expect(onSubscriptionData).toHaveBeenCalledTimes(0);
    unmount();
  });

  it('should create a subscription after skip has changed from true to a falsy value', async () => {
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const results = [
      {
        result: { data: { car: { make: 'Pagani' } } }
      },
      {
        result: { data: { car: { make: 'Scoop' } } }
      }
    ];

    const link = new MockSubscriptionLink();
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false })
    });

    const { result, rerender, waitForNextUpdate } = renderHook(
      ({ skip }) => useSubscription(subscription, { skip }),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
        initialProps: { skip: true },
      },
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toBe(undefined);

    rerender({ skip: false });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toBe(undefined);

    setTimeout(() => {
      link.simulateResult(results[0]);
    });

    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(results[0].result.data);
    expect(result.current.error).toBe(undefined);

    rerender({ skip: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toBe(undefined);

    // ensure state persists across rerenders
    rerender({ skip: true });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toBe(undefined);

    await expect(waitForNextUpdate({ timeout: 20 }))
      .rejects.toThrow('Timed out');

    // ensure state persists across rerenders
    rerender({ skip: false });

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toBe(undefined);
    setTimeout(() => {
      link.simulateResult(results[1]);
    });

    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(results[1].result.data);
    expect(result.current.error).toBe(undefined);
  });

  it('should share context set in options', async () => {
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const results = ['Audi', 'BMW'].map(make => ({
      result: { data: { car: { make } } }
    }));

    let context: string;
    const link = new MockSubscriptionLink();
    const contextLink = new ApolloLink((operation, forward) => {
      context = operation.getContext()?.make
      return forward(operation);
    });
    const client = new ApolloClient({
      link: concat(contextLink, link),
      cache: new Cache({ addTypename: false })
    });

    const { result, waitForNextUpdate } = renderHook(
      () => useSubscription(subscription, {
        context: { make: 'Audi' },
      }),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(undefined);
    setTimeout(() => {
      link.simulateResult(results[0]);
    }, 100);

    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toEqual(results[0].result.data);

    setTimeout(() => {
      link.simulateResult(results[1]);
    });

    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toEqual(results[1].result.data);

    expect(context!).toBe('Audi');
  });

  it('should handle multiple subscriptions properly', async () => {
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const results = ['Audi', 'BMW'].map(make => ({
      result: { data: { car: { make } } }
    }));

    const link = new MockSubscriptionLink();
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false })
    });

    const { result, waitForNextUpdate } = renderHook(
      () => ({
        sub1: useSubscription(subscription),
        sub2: useSubscription(subscription),
      }),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    expect(result.current.sub1.loading).toBe(true);
    expect(result.current.sub1.error).toBe(undefined);
    expect(result.current.sub1.data).toBe(undefined);
    expect(result.current.sub2.loading).toBe(true);
    expect(result.current.sub2.error).toBe(undefined);
    expect(result.current.sub2.data).toBe(undefined);

    setTimeout(() => {
      link.simulateResult(results[0]);
    });

    await waitForNextUpdate();
    expect(result.current.sub1.loading).toBe(false);
    expect(result.current.sub1.error).toBe(undefined);
    expect(result.current.sub1.data).toEqual(results[0].result.data);
    expect(result.current.sub2.loading).toBe(false);
    expect(result.current.sub2.error).toBe(undefined);
    expect(result.current.sub2.data).toEqual(results[0].result.data);

    setTimeout(() => {
      link.simulateResult(results[1]);
    });

    await waitForNextUpdate();
    expect(result.current.sub1.loading).toBe(false);
    expect(result.current.sub1.error).toBe(undefined);
    expect(result.current.sub1.data).toEqual(results[1].result.data);
    expect(result.current.sub2.loading).toBe(false);
    expect(result.current.sub2.error).toBe(undefined);
    expect(result.current.sub2.data).toEqual(results[1].result.data);
  });

  it('should handle immediate completions gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const link = new MockSubscriptionLink();
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false })
    });

    const { result, waitForNextUpdate } = renderHook(
      () => useSubscription(subscription),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    setTimeout(() => {
      // Simulating the behavior of HttpLink, which calls next and complete in sequence.
      link.simulateResult({ result: { data: null } }, /* complete */ true);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(undefined);
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(undefined);
    expect(result.current.data).toBe(null);

    await expect(waitForNextUpdate({ timeout: 20 }))
      .rejects.toThrow('Timed out');

    // ForestRun doesn't support this
    // expect(errorSpy).toHaveBeenCalledTimes(1);
    // expect(errorSpy.mock.calls[0][0]).toBe(
    //   "Missing field 'car' while writing result {}",
    // );
    errorSpy.mockRestore();
  });

  it('should handle immediate completions with multiple subscriptions gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const subscription = gql`
      subscription {
        car {
          make
        }
      }
    `;

    const link = new MockSubscriptionLink();
    const client = new ApolloClient({
      link,
      cache: new Cache({ addTypename: false }),
    });

    const { result, waitForNextUpdate } = renderHook(
      () => ({
        sub1: useSubscription(subscription),
        sub2: useSubscription(subscription),
        sub3: useSubscription(subscription),
      }),
      {
        wrapper: ({ children }) => (
          <ApolloProvider client={client}>
            {children}
          </ApolloProvider>
        ),
      },
    );

    expect(result.current.sub1.loading).toBe(true);
    expect(result.current.sub1.error).toBe(undefined);
    expect(result.current.sub1.data).toBe(undefined);
    expect(result.current.sub2.loading).toBe(true);
    expect(result.current.sub2.error).toBe(undefined);
    expect(result.current.sub2.data).toBe(undefined);
    expect(result.current.sub3.loading).toBe(true);
    expect(result.current.sub3.error).toBe(undefined);
    expect(result.current.sub3.data).toBe(undefined);

    setTimeout(() => {
      // Simulating the behavior of HttpLink, which calls next and complete in sequence.
      link.simulateResult({ result: { data: null } }, /* complete */ true);
    });

    await waitForNextUpdate();

    expect(result.current.sub1.loading).toBe(false);
    expect(result.current.sub1.error).toBe(undefined);
    expect(result.current.sub1.data).toBe(null);
    expect(result.current.sub2.loading).toBe(false);
    expect(result.current.sub2.error).toBe(undefined);
    expect(result.current.sub2.data).toBe(null);
    expect(result.current.sub3.loading).toBe(false);
    expect(result.current.sub3.error).toBe(undefined);
    expect(result.current.sub3.data).toBe(null);

    await expect(waitForNextUpdate({ timeout: 20 }))
      .rejects.toThrow('Timed out');

    // ForestRun doesn't support this
    // expect(errorSpy).toHaveBeenCalledTimes(3);
    // expect(errorSpy.mock.calls[0][0]).toBe(
    //   "Missing field 'car' while writing result {}",
    // );
    // expect(errorSpy.mock.calls[1][0]).toBe(
    //   "Missing field 'car' while writing result {}",
    // );
    // expect(errorSpy.mock.calls[2][0]).toBe(
    //   "Missing field 'car' while writing result {}",
    // );
    errorSpy.mockRestore();
  });
});
