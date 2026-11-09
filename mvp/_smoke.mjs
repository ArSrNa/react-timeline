import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
const code = readFileSync(new URL('./app.js', import.meta.url), 'utf8')

const window = new Window({ url: 'http://localhost/' })
const document = window.document
document.write(html)

const run = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', code)
run(window, document, window.performance, cb => setTimeout(() => cb(0), 0), id => clearTimeout(id))

const $ = id => document.getElementById(id)
const rows = () => document.querySelectorAll('#canvas .row')

console.log('lanes rows:', rows().length)
if (rows().length !== 6) throw new Error('lanes rows mismatch')

// 上滚：自动切平铺，t=5 时第二个片段贴顶
const follow = $('followMode')
follow.value = 'scroll'
follow.dispatchEvent(new window.Event('change', { bubbles: true }))
console.log('layout after follow:', $('layoutSeg').querySelector('.active').textContent, '| rows:', rows().length)
if (!document.querySelector('[data-layout="sequence"]').classList.contains('active')) throw new Error('not switched to sequence')
if ($('scroller').scrollTop !== 32) throw new Error('scroll follow mismatch: ' + $('scroller').scrollTop)

// 直接消失：0–3.25 的行折叠
follow.value = 'hide'
follow.dispatchEvent(new window.Event('change', { bubbles: true }))
const gone = document.querySelectorAll('#canvas .row.gone').length
console.log('hidden rows @5s:', gone, '| scrollTop:', $('scroller').scrollTop)
if (gone !== 1) throw new Error('hide mode mismatch')

// 时间推进到 20s：消失的行应变为 6 行
const slider = $('timeSlider')
slider.value = '20'
slider.dispatchEvent(new window.Event('input', { bubbles: true }))
console.log('hidden rows @20s:', document.querySelectorAll('#canvas .row.gone').length)
if (document.querySelectorAll('#canvas .row.gone').length !== 6) throw new Error('hide mode @20 mismatch')

// 切回多轨：跟随自动关闭
document.querySelector('[data-layout="lanes"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
console.log('follow after lanes:', $('followMode').value, '| rows:', rows().length)
if ($('followMode').value !== 'off') throw new Error('follow not reset')
if (rows().length !== 6) throw new Error('lanes restore mismatch')

console.log('SMOKE OK')
