from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} block not found')
    return text.replace(old, new, 1)


player_path = Path('src/renderer/components/CommonPlayer.vue')
player = player_path.read_text()

player = replace_once(
    player,
    '''  &.no-lyric {
    justify-content: center;

    .left-side {
      padding: 0;
    }
    .right-side {
      flex: 0;
      padding: 0;
    }
  }
''',
    '''  &.no-lyric {
    justify-content: center;
    padding: 0;

    .left-side {
      flex: 1 1 100%;
      width: 100%;
      padding: 0;
      align-items: center;
    }
    .right-side {
      flex: 0 0 0;
      width: 0;
      min-width: 0;
      padding: 0;
      overflow: hidden;
    }
  }
''',
    'no-lyric layout',
)

player = replace_once(
    player,
    '''    .left-side {
      flex: unset;
      justify-content: unset;
      padding: 0;
      margin-bottom: 4vh;
''',
    '''    .left-side {
      flex: unset;
      width: 100%;
      justify-content: unset;
      align-items: center;
      padding: 0;
      margin-bottom: 4vh;
''',
    'mobile left-side layout',
)

player_path.write_text(player)


test_path = Path('tests/feature-regression.spec.ts')
tests = test_path.read_text()
marker = '''  test('keeps the Classic lyric toolbar and comments inside the viewport tool lane', () => {
'''
insert = '''  test('centers the Classic cover when lyrics are absent or the window becomes portrait', () => {
    const commonPlayer = readSource('src/renderer/components/CommonPlayer.vue')

    expect(commonPlayer).toContain('&.no-lyric {')
    expect(commonPlayer).toContain('flex: 1 1 100%')
    expect(commonPlayer).toContain('flex: 0 0 0')
    expect(commonPlayer).toContain('width: 0')
    expect(commonPlayer).toContain('overflow: hidden')
    expect(commonPlayer).toContain('&.isMobile {')
    expect(commonPlayer).toContain('width: 100%')
    expect(commonPlayer).toContain('align-items: center')
  })

'''
tests = replace_once(tests, marker, insert + marker, 'Classic centering regression test')
test_path.write_text(tests)
