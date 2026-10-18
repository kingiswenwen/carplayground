import path from 'node:path';
import { verifyPackage } from './release-lib.mjs';
if(!process.argv[2])throw Error('用法：npm run release:verify -- <发布包目录>');
const manifest=await verifyPackage(path.resolve(process.argv[2]));
console.log(process.argv.includes('--json') ? JSON.stringify(manifest) : `发布包校验通过：${manifest.appReleaseId} / ${manifest.contentReleaseId}，${manifest.files.length} 个文件，${manifest.totalBytes} 字节；用途 ${manifest.kind}`);
