# Opens the PowerPoint package built by scripts/build-pptx-fixture.ts with
# python-pptx, reads its slides back, and asserts success. This is the CI
# round trip for the repository's own writer (src/pptxwriter.ts, FR-51): the
# package has never shown a reproducible defect under any available
# validator, so an independent implementation opening it and reading its
# slides is the check. The owner's own machine remains the acceptance test
# for the double-click behaviour itself. Since v1.13.0 the package carries
# several image slides (the stage, the timeline page, an economics page)
# before the table slides. Run:
# python3 scripts/check-pptx.py [path-to.pptx]
import sys

from pptx import Presentation
from pptx.util import Emu

path = sys.argv[1] if len(sys.argv) > 1 else "dist/pptx-roundtrip/roundtrip.pptx"

prs = Presentation(path)

slides = list(prs.slides)
assert len(slides) == 4, f"expected 4 slides, got {len(slides)}"
size = (Emu(prs.slide_width).inches, Emu(prs.slide_height).inches)
assert abs(size[0] - 13.3333) < 0.001 and abs(size[1] - 7.5) < 0.001, f"the slide is not 16:9: {size}"

# The first three slides are pictures: the stage, the timeline page, and an
# economics page (FR-12 as amended in v1.13.0), each filling the slide.
for i, expected_name in enumerate(["Presentation stage", "Document page", "Document page"]):
    pictures = [s for s in slides[i].shapes if s.shape_type == 13]  # MSO_SHAPE_TYPE.PICTURE
    assert len(pictures) == 1, f"slide {i + 1} should hold exactly one picture, got {len(pictures)}"
    pic = pictures[0]
    assert pic.name == expected_name, f"slide {i + 1} picture name {pic.name!r}"
    assert pic.width == prs.slide_width and pic.height == prs.slide_height, "the picture does not fill the slide"

fourth = slides[3]
tables = [s for s in fourth.shapes if s.has_table]
assert len(tables) == 1, f"slide 4 should hold exactly one table, got {len(tables)}"
grid = tables[0].table
rows = list(grid.rows)
headings = [cell.text for cell in rows[0].cells]
assert headings == ["No.", "Name", "Note"], f"unexpected headings: {headings}"
body = [[cell.text for cell in row.cells] for row in rows[1:]]
assert body[0][0] == "1" and body[0][1] == "First example item", f"unexpected first row: {body[0]}"
assert body[1][1] == "Second example item", f"unexpected second row: {body[1]}"

titles = [shape.text_frame.text for shape in fourth.shapes if shape.has_text_frame and shape.text_frame.text]
assert any("Items 1 to 2 of 2" in t for t in titles), f"the slide title is missing: {titles}"

print(f"python-pptx {__import__('pptx').__version__} opened {path}: {len(slides)} slides, "
      f"slides 1-3 pictures, slide 4 a table with headings {headings} and {len(body)} rows, "
      f"title {titles[0]!r}")
