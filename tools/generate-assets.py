"""Generate deterministic local icons and a short warning signal."""
from pathlib import Path
import math
import struct
import wave
from PIL import Image, ImageDraw

project = Path(__file__).resolve().parents[1]
root = project / "extension" if (project / "extension").is_dir() else project
(root / "icons").mkdir(exist_ok=True)
(root / "sounds").mkdir(exist_ok=True)
for size in (48, 96):
	image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
	draw = ImageDraw.Draw(image)
	s = size / 96
	def box(values):
		return tuple(round(v * s) for v in values)
	draw.rounded_rectangle(box((0, 0, 95, 95)), radius=round(24 * s), fill="#26674e")
	draw.ellipse(box((19, 19, 76, 76)), outline="#f4f5e7", width=round(5 * s))
	draw.line(box((48, 32, 48, 49)), fill="#f4f5e7", width=round(5 * s))
	draw.line(box((48, 49, 61, 57)), fill="#f4f5e7", width=round(5 * s))
	draw.ellipse(box((43, 44, 52, 53)), fill="#f4f5e7")
	image.save(root / "icons" / f"icon-{size}.png")
sample_rate = 22050
samples = []
for n in range(round(0.8 * sample_rate)):
	time = n / sample_rate
	value = 0.0
	for index, frequency in enumerate((660, 660, 880)):
		local = time - index * 0.23
		if 0 <= local < 0.18:
			envelope = min(1, local / 0.015) * min(1, (0.18 - local) / 0.04)
			value = 0.27 * envelope * math.sin(2 * math.pi * frequency * local)
	samples.append(struct.pack("<h", round(value * 32767)))
with wave.open(str(root / "sounds" / "warning.wav"), "wb") as output:
	output.setnchannels(1)
	output.setsampwidth(2)
	output.setframerate(sample_rate)
	output.writeframes(b"".join(samples))
print("Generated icons and warning.wav")
