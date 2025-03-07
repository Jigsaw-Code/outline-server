import { client } from './generated/client.gen';

import * as generated from './generated';

export type * from './generated';

export default (baseUrl: string) => {
  client.setConfig({ baseUrl, headers: { "ngrok-skip-browser-warning": "69420" } });

  return generated;
}