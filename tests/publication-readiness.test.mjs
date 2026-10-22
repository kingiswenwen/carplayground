import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readinessSnapshot} from '../scripts/release-lib.mjs';

const waiver = {status: 'waived', waivedBy: 'user', waivedAt: '2026-10-21', note: '用户要求略过真机，按浏览器验证', evidence: 'private:device-scope-record'};
test('用户设备豁免单独留证，不再阻塞；其他未完成条件仍保留', () => {
  const snapshot = readinessSnapshot({requirements: {'real-ipad': waiver, 'real-phone': waiver, 'content-review': {status: 'passed'}, 'audio-distribution': {status: 'unverified', note: '仍待核实'}}});
  assert.deepEqual(snapshot.waived.map(item => item.id), ['real-ipad', 'real-phone']);
  assert.deepEqual(snapshot.outstanding.map(item => item.id), ['audio-distribution']);
  assert.equal(snapshot.waived[0].waivedBy, 'user');
  assert.equal(snapshot.waived[0].status, 'waived');
});
test('没有用户依据的设备豁免拒绝接受', () => {
  for (const field of ['waivedBy', 'waivedAt', 'note', 'evidence']) {
    const missing = {...waiver}; delete missing[field];
    assert.throws(() => readinessSnapshot({requirements: {'real-ipad': missing}}), /缺少用户豁免依据/);
  }
});
test('略过设备不授权略过声音、家庭、云端或备份条件', () => {
  for (const id of ['audio-listening', 'audio-distribution', 'family-observation', 'cloud-configuration', 'nas-backup']) {
    assert.throws(() => readinessSnapshot({requirements: {[id]: waiver}}), /不在设备豁免范围/);
  }
});
