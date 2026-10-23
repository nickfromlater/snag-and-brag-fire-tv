"""Small deterministic test fixtures, never photographs from a person.

Fonts come from the approved reference bundle. WAVs are calibration signals for
the overlap/latency test, not the production game's audio.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image, ImageDraw
import math
import struct
import wave
import json

root = Path(__file__).resolve().parents[2]
assets = root / 'spike/vega-app/src/assets'
fonts = assets / 'fonts'
fonts.mkdir(exist_ok=True)
for source, destination in [('LilitaOne-Regular.woff2','Lilita One.ttf'),
                            ('Rubik-700.woff2','Rubik.ttf')]:
    font = TTFont(root / 'reference/fonts' / source)
    font.flavor = None
    font.save(fonts / destination)
    if source.startswith('Lilita'):
        glyphs=font.getGlyphSet(); mapping=font.getBestCmap(); factor=92/font['head'].unitsPerEm
        advance=8; outlines=[]
        for character in 'SNAG & BRAG':
            glyph=glyphs[mapping[ord(character)]]
            pen=SVGPathPen(glyphs)
            glyph.draw(TransformPen(pen,(factor,0,0,-factor,advance,94)))
            outlines.append(pen.getCommands());advance+=glyph.width*factor
        (assets/'title-path.json').write_text(json.dumps({'d':''.join(outlines),'width':advance})+'\n')
for index, color in enumerate(['#FF4FA0','#B8F23B','#FFD43B','#3FE0D0']):
    image = Image.new('RGB',(96,64),'#2B3BFF')
    draw = ImageDraw.Draw(image)
    draw.rectangle((10,10,85,54),fill=color)
    draw.ellipse((30,15,65,50),fill='#FFF8EC',outline='#0E0B2B',width=3)
    draw.text((5,1),f'TEST TILE {index+1}',fill='white')
    image.save(assets / f'thumb-{index}.jpg',quality=45)
audio = assets / 'audio'
audio.mkdir(exist_ok=True)
rate = 48000
for name, seconds, tones in [('music',4,[220,277.18,329.63]),
                              ('sfx1',1,[440]),('sfx2',1,[660]),('sfx3',1,[880])]:
    with wave.open(str(audio / (name+'.wav')),'wb') as file:
        file.setnchannels(1); file.setsampwidth(2); file.setframerate(rate)
        values = []
        for n in range(round(seconds*rate)):
            t=n/rate
            gain=0.08 if name=='music' else 0.1*min(1,t/0.01,(seconds-t)/0.02)
            value=sum(math.sin(t*math.tau*f) for f in tones)/len(tones)
            values.append(struct.pack('<h',round(32767*gain*value)))
        file.writeframes(b''.join(values))
print('Converted Lilita One and Rubik; created four JPEG fixtures and four PCM WAV calibration files')
