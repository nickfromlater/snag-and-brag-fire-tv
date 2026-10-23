"""Compare approved reference shots with synthetic VVD captures at logical size."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
captures = root / 'docs/review/tv-worker-c'
groups = {
    'brag': [('tv-08-brag-lines.png', 'native-brag-lines.png', 'Brag lines'),
             ('tv-09-brag-mash.png', 'native-brag-mash.png', 'Live mash'),
             ('tv-10-brag-knockout.png', 'native-brag-knockout.png', 'Knockout')],
    'show': [('tv-11-showstopper-vote.png', 'native-show-vote.png', 'Voting'),
             ('tv-12-showstopper-win.png', 'native-show-win.png', 'Holographic winner')],
    'champ': [('tv-13-finale.png', 'native-champ.png', 'Champion podium and Object of the Night')],
}
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
for scene, rows in groups.items():
    sheet = Image.new('RGB', (2560, len(rows) * 762), '#FFF8EC')
    draw = ImageDraw.Draw(sheet)
    for index, (reference, actual, caption) in enumerate(rows):
        top = index * 762
        draw.text((16, top + 9), 'MOCKUP · ' + caption, font=font, fill='#0E0B2B')
        draw.text((1296, top + 9), 'VVD · synthetic objects / bots', font=font, fill='#0E0B2B')
        for x, path in [(0, root / 'reference/screens' / reference), (1280, captures / actual)]:
            with Image.open(path) as image:
                sheet.paste(image.convert('RGB').resize((1280, 720), Image.Resampling.LANCZOS), (x, top + 42))
    output = root / 'docs/review' / ('tv-' + scene + '-compare.png')
    sheet.save(output, optimize=True)
    print(output.relative_to(root))
