import * as all from './roomsAll';

/** The phone: the rooms are in the app from the start (the web fetches them, src/rooms.ts). */
export type Rooms = typeof all;
export function useRooms(_wanted: boolean): Rooms | null {
  return all;
}
