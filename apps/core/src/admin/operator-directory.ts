import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function operatorDirectory() {
  const base = process.platform === 'win32' ? (process.env.LOCALAPPDATA || resolve(homedir(), 'AppData/Local'))
    : process.platform === 'darwin' ? resolve(homedir(), 'Library/Application Support')
      : (process.env.XDG_STATE_HOME || resolve(homedir(), '.local/state'));
  return resolve(base, 'LifeInsuranceAIAssistant/operator');
}
