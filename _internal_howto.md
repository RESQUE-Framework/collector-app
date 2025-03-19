## Batch process screenshot images

```bash
for img in *.png; do
  filename=$(basename "$img")
  magick "$img" \
    -resize 650x\> \
    -bordercolor "#888888" -border 2 \
    \( +clone -background black -shadow 60x4+2+2 \) \
    +swap -background none -layers merge +repage \
    "output/$filename"
done
```
