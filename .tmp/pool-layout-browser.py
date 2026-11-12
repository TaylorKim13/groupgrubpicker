from pathlib import Path
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page()
    for version in ['before','after']:
        for width in [320,375,390,430,768,1440]:
            page.set_viewport_size({'width':width,'height':844})
            page.goto((Path(__file__).parent / f'pool-{version}.html').resolve().as_uri())
            result=page.evaluate('''() => ({
                width:innerWidth,documentWidth:document.documentElement.scrollWidth,
                overflowingCards:[...document.querySelectorAll('main li, [id^="restaurant-candidate-"]')].filter(el=>el.getBoundingClientRect().right>innerWidth).length,
                createButtonVisible:!![...document.querySelectorAll('button')].find(el=>el.textContent==='Create Room'),
                nearbyCount:document.querySelectorAll('[id^="restaurant-candidate-"]').length
            })''')
            print(json.dumps({'version':version,**result}),flush=True)
            if width==320:
                page.screenshot(path=str(Path(__file__).parent/f'pool-{version}.png'),full_page=True)
            if version=='after':
                assert result['documentWidth']==width
                assert result['overflowingCards']==0
                assert result['createButtonVisible'] and result['nearbyCount']==3
                assert page.evaluate('''() => {
                  const sections=[...document.querySelectorAll('main section')];
                  return sections.at(-1).textContent.includes('Voting pool') && sections.at(-1).getBoundingClientRect().top > document.querySelector('[id^="restaurant-candidate-"]').getBoundingClientRect().bottom;
                }'''), 'Voting pool should follow nearby restaurants'
    for width in [320,390,1440]:
        page.set_viewport_size({'width':width,'height':844})
        page.goto((Path(__file__).parent / 'pool-voting.html').resolve().as_uri())
        positions=page.evaluate('''() => {
          const pool=document.querySelector('[data-voting-pool]');
          const submit=document.querySelector('[data-vote-guide="submit"]');
          const end=[...document.querySelectorAll('button')].find(el=>el.textContent.includes('End voting'));
          return {poolBottom:pool.getBoundingClientRect().bottom,submitTop:submit.getBoundingClientRect().top,endTop:end.getBoundingClientRect().top,submitBottom:submit.getBoundingClientRect().bottom,position:getComputedStyle(submit).position};
        }''')
        assert positions['submitTop'] >= positions['poolBottom']
        assert positions['endTop'] >= positions['submitBottom']
        assert positions['position'] == 'static'
        print(json.dumps({'votingWidth':width,**positions}),flush=True)
    browser.close()
