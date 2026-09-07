import type {
  GameKind,
  GameProfile,
  GameRules,
  GameView,
} from '@restaurant-os/types';
import { api } from '@/lib/api-client';
const path = (token: string) =>
  `/public/orders/track/${encodeURIComponent(token)}/games`;
export const gameApi = {
  profile: (token: string) => api.get<GameProfile>(path(token)),
  start: (token: string, kind: GameKind) =>
    api.post<GameView>(path(token), { kind }),
  move: (token: string, id: string, revision: number, value: number) =>
    api.post<GameView>(`${path(token)}/${id}/moves`, { revision, value }),
  reward: (token: string, requestId: string) =>
    api.post<{ code: string }>(`${path(token)}/reward`, { requestId }),
  rules: () => api.get<GameRules>('/games/program'),
  save: (rules: GameRules) => api.put<GameRules>('/games/program', rules),
};
