"""制作期工具：在独立 Python 环境安装 edge-tts；网页运行时不访问合成服务。"""
import asyncio
import json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parents[1]
SPEECH = json.loads((ROOT / 'content/r3.json').read_text())['speech']

async def main():
    semaphore = asyncio.Semaphore(3)
    async def make(clip_id, line):
        path = ROOT / 'public/media' / f'{clip_id}.mp3'
        if path.exists() and path.stat().st_size > 0:
            return
        voice = 'zh-CN-XiaoxiaoNeural' if line['locale'] == 'zh-CN' else 'en-US-JennyNeural'
        async with semaphore:
            await edge_tts.Communicate(line['text'], voice, rate='-12%').save(str(path))
            print(clip_id, flush=True)
    await asyncio.gather(*(make(key, line) for key, line in SPEECH.items()))

asyncio.run(main())
