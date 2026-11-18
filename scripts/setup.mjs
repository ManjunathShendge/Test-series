import { copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

for (const directory of ['.', 'apps/web', 'apps/mobile']) {
  const destination = `${directory}/.env`;
  try {
    await access(destination);
    console.log(`Kept existing ${destination}`);
  } catch {
    await copyFile(`${directory}/.env.example`, destination, constants.COPYFILE_EXCL);
    console.log(`Created ${destination}`);
  }
}
