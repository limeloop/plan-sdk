import * as React from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useApiClient } from './context.js';
import type { Session } from '../auth/session.js';
import type {
  Person,
  Team,
  TeamAddMemberInput,
  TeamCreateInput,
  Unit,
  Versioned,
  WorkItem,
  WorkItemCreateInput,
  WorkItemUpdateInput,
} from '../types.js';

/** The signed-in session, live: updates on sign-in, sign-out and token refresh. */
export function useSession(): Session | null {
  const client = useApiClient();
  return React.useSyncExternalStore(
    (onChange) => client.auth.subscribe(onChange),
    () => client.auth.getSession(),
    () => client.auth.getSession(),
  );
}

/** You, your units, and what you may do. `null` while signed out. */
export function useMe() {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => client.me(),
    enabled: session !== null,
  });
}

/** Vocabulary, categories and attribute schemas: the same for everyone signed in. */
export function useConfig() {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['config'],
    queryFn: () => client.config(),
    enabled: session !== null,
    staleTime: 5 * 60 * 1000,
  });
}

/** `v('work_item')` gives "Körning" for one client and "Booking" for another. */
export function useVocabulary(): (key: string) => { singular: string; plural: string } | undefined {
  const { data } = useConfig();
  return React.useCallback((key: string) => data?.vocabulary[key], [data]);
}

export function useCategories(entity: string) {
  const { data, ...rest } = useConfig();
  return { data: data?.categories[entity] ?? [], ...rest };
}

export function useAttributeSchema(entity: string) {
  const { data, ...rest } = useConfig();
  return { data: data?.attribute_schemas[entity], ...rest };
}

export function useUnits(): UseQueryResult<Unit[]> {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['units'],
    queryFn: () => client.units.list(),
    enabled: session !== null,
  });
}

export function usePeople(params?: { unitId?: string }): UseQueryResult<Person[]> {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['people', params?.unitId],
    queryFn: () => client.people.list(params),
    enabled: session !== null,
  });
}

export function useWorkItems(params: { unitId: string; date: string }): UseQueryResult<WorkItem[]> {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['work-items', params.unitId, params.date],
    queryFn: () => client.workItems.list(params),
    enabled: session !== null,
  });
}

export function useWorkItem(id: string): UseQueryResult<WorkItem> {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['work-item', id],
    queryFn: () => client.workItems.get(id),
    enabled: session !== null,
  });
}

export function useCreateWorkItem(): UseMutationResult<WorkItem, Error, WorkItemCreateInput> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkItemCreateInput) => client.workItems.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-items'] }),
  });
}

export interface UpdateWorkItemInput {
  id: string;
  patch: Partial<WorkItemUpdateInput>;
  versioned: Versioned;
}

/** Send only what changed, with the version that was loaded: never the whole object. */
export function useUpdateWorkItem(): UseMutationResult<WorkItem, Error, UpdateWorkItemInput> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, versioned }: UpdateWorkItemInput) =>
      client.workItems.update(id, patch, versioned),
    onSuccess: (workItem) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      queryClient.setQueryData(['work-item', workItem.id], workItem);
    },
  });
}

export function useTeams(params: { unitId: string; date: string }): UseQueryResult<Team[]> {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['teams', params.unitId, params.date],
    queryFn: () => client.teams.list(params),
    enabled: session !== null,
  });
}

export function useTeam(id: string): UseQueryResult<Team> {
  const client = useApiClient();
  const session = useSession();
  return useQuery({
    queryKey: ['team', id],
    queryFn: () => client.teams.get(id),
    enabled: session !== null,
  });
}

export function useCreateTeam(): UseMutationResult<Team, Error, TeamCreateInput> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeamCreateInput) => client.teams.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export interface AddTeamMemberInput {
  teamId: string;
  input: TeamAddMemberInput;
}

export function useAddTeamMember(): UseMutationResult<Team, Error, AddTeamMemberInput> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, input }: AddTeamMemberInput) => client.teams.addMember(teamId, input),
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.setQueryData(['team', team.id], team);
    },
  });
}

export interface RemoveTeamMemberInput {
  teamId: string;
  personId: string;
}

export function useRemoveTeamMember(): UseMutationResult<Team, Error, RemoveTeamMemberInput> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, personId }: RemoveTeamMemberInput) =>
      client.teams.removeMember(teamId, personId),
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.setQueryData(['team', team.id], team);
    },
  });
}
