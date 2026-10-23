set -e
cd ~/builds/snag-and-brag/footage/edit
ls segs/*.mkv | sed "s/^/file '/;s/$/'/" > concat.txt
ffmpeg -v error -y -f concat -safe 0 -i concat.txt -c copy joined.mkv
ffmpeg -v error -y -i joined.mkv -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 60 -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$1"
ffprobe -v error -show_entries format=duration,size -of csv=p=0 "$1"
