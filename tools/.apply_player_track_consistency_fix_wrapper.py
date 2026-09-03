from pathlib import Path
import subprocess

subprocess.run(['python3', 'tools/.apply_player_track_consistency_fix.py'], check=True)

test_path = Path('tests/liked-lyric-regression.spec.ts')
test_path.write_text(test_path.read_text(encoding='utf-8').rstrip() + '\n', encoding='utf-8')
