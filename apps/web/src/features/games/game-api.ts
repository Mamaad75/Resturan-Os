import type {
  GameKind,
  GameProfile,
  GameRules,
  GameView,
} from '@restaurant-os/types';
import { api } from '@/lib/api-client';
const path = (token: string) =>
  `/public/orders/track/${encodeURIComponent(token)}/games`;
function playerOptions() {
  const name = 'foodos-game-player-key';
  let key = localStorage.getItem(name);
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    localStorage.setItem(name, key);
  }
  return { headers: { 'X-Game-Key': key } };
}
export const gameApi = {
  profile: async (token: string) =>
    api.get<GameProfile>(path(token), playerOptions()),
  start: (token: string, kind: GameKind) =>
    api.post<GameView>(path(token), { kind }, playerOptions()),
  move: (token: string, id: string, revision: number, value: number) =>
    api.post<GameView>(
      `${path(token)}/${id}/moves`,
      { revision, value },
      playerOptions(),
    ),
  reward: (token: string, requestId: string) =>
    api.post<{ code: string }>(
      `${path(token)}/reward`,
      { requestId },
      playerOptions(),
    ),
  rules: () => api.get<GameRules>('/games/program'),
  save: (rules: GameRules) => api.put<GameRules>('/games/program', rules),
};
