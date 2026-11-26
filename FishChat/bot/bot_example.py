#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FishChat 示例机器人
=================

用法：
    1. 先启动 FishChat（桌面端或 `npm start`）
    2. 安装依赖：pip install websockets
    3. 运行本文件：python bot_example.py

机器人连上 FishChat 自带的 WebSocket 端口后，就能在界面里出现并开始聊天。
把这个文件当作模板，把 brain() 换成你自己的逻辑（大模型、自动化脚本……）即可。
"""

import asyncio
import base64
import json
import os
import sys

try:
    import websockets
except ImportError:
    print("缺少依赖，请先运行：pip install websockets")
    sys.exit(1)

HOST = "127.0.0.1"
PORT = 3210
BOT_NAME = "小Q"


async def brain(text: str) -> str:
    """机器人的回复逻辑。TODO: 换成你自己的实现（比如调用大模型 API）。"""
    text = (text or "").strip()
    if not text:
        return "（发呆）"
    if "你好" in text or "hi" in text.lower():
        return "你好呀！我是小Q，很高兴认识你～"
    if "名字" in text:
        return f"我叫{BOT_NAME}，是 FishChat 里的示例机器人。"
    if "几点" in text or "时间" in text:
        import datetime

        return "现在是 " + datetime.datetime.now().strftime("%H:%M:%S")
    if "表情包" in text or "表情" in text:
        return "试试输入框上面的 🎨 按钮，有一整套表情包；我也可以收图片和文件哦。"
    return f"你说的是：“{text}”。（这是示例机器人的回声，接到自己的逻辑后就不会这么呆啦）"


async def send_reply(ws, text: str, attachments=None):
    await ws.send(json.dumps({"type": "reply", "text": text, "attachments": attachments or []}))


async def send_file(ws, path: str, kind: str = "file"):
    """演示：机器人主动发文件 / 图片给用户。"""
    if not os.path.exists(path):
        return
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    name = os.path.basename(path)
    await ws.send(
        json.dumps(
            {
                "type": "message",
                "text": "",
                "attachments": [{"type": kind, "name": name, "size": os.path.getsize(path), "data": data}],
            }
        )
    )


async def send_voice(ws, path: str, duration_ms: int = 0):
    """演示：机器人发语音消息。音频建议用 .ogg / .mp3 / .wav / .webm。

    duration_ms 是语音时长（毫秒），不填就显示“语音”。
    """
    if not os.path.exists(path):
        return
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("ascii")
    await ws.send(
        json.dumps(
            {
                "type": "reply",
                "text": "",
                "attachments": [
                    {
                        "type": "voice",
                        "name": os.path.basename(path),
                        "size": os.path.getsize(path),
                        "duration": duration_ms,
                        "data": data,
                    }
                ],
            }
        )
    )


async def main():
    url = f"ws://{HOST}:{PORT}"
    print(f"正在连接 {url} ...")
    try:
        async with websockets.connect(url) as ws:
            # 第一步：打招呼（必须 5 秒内发送）
            await ws.send(json.dumps({"type": "hello", "name": BOT_NAME}))
            hello = json.loads(await ws.recv())
            print("握手成功：", hello)

            # 第二步：循环收消息、回复
            async for raw in ws:
                msg = json.loads(raw)
                if msg.get("type") != "message":
                    continue

                text = msg.get("text", "")
                attachments = msg.get("attachments") or []
                print(f"收到消息：{text!r}  附件数：{len(attachments)}")

                if attachments:
                    names = "、".join(a.get("name", "?") for a in attachments)
                    kinds = {a.get("type") for a in attachments}
                    note = "（含语音）" if "voice" in kinds else ""
                    await ws.send(json.dumps({"type": "typing"}))
                    await asyncio.sleep(0.4)
                    await send_reply(ws, f"收到 {len(attachments)} 个附件：{names}。{note}文件我先收下啦～")
                    continue

                await ws.send(json.dumps({"type": "typing"}))
                await asyncio.sleep(0.6)  # 假装思考一下
                reply = await brain(text)
                await send_reply(ws, reply)

                # 演示主动发文件：在消息里说“发我文件”即可（需要本地有对应文件）
                if "发我文件" in text and os.path.exists(__file__):
                    await send_file(ws, __file__, "file")
    except ConnectionRefusedError:
        print("连不上 FishChat：请先启动 FishChat 再运行本脚本。")
    except websockets.ConnectionClosed:
        print("连接已关闭。FishChat 可能退出了，或者同名机器人被新连接顶替了。")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n已退出。")
