import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Todo } from '../types.js';
import type { ApiError } from '../api/errors.js';

export type TodoOptimisticContext = { previous: Todo[] | undefined };

export interface UseOptimisticTodoMutationOptions<TData, TVariables> {
  mutationKey: readonly unknown[];
  mutationFn: (input: TVariables) => Promise<TData>;
  applyOptimistic: (prev: Todo[] | undefined, input: TVariables) => Todo[];
}

export function useOptimisticTodoMutation<TData, TVariables>(
  options: UseOptimisticTodoMutationOptions<TData, TVariables>,
): UseMutationResult<TData, ApiError, TVariables, TodoOptimisticContext> {
  const queryClient = useQueryClient();

  return useMutation<TData, ApiError, TVariables, TodoOptimisticContext>({
    mutationKey: options.mutationKey,
    mutationFn: options.mutationFn,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previous = queryClient.getQueryData<Todo[]>(['todos']);
      queryClient.setQueryData<Todo[]>(['todos'], options.applyOptimistic(previous, input));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context) {
        queryClient.setQueryData(['todos'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
}
