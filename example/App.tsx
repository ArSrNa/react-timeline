import { SyntheticEvent, useEffect, useRef, useState } from 'react';
import Component from '../packages/Component';
import './index.scss'
import { characters, data, order } from './data';

const items = data.map(m => ({
  time: m.t, content: m.c
}));

const characterItems = order.map(m => ({
  time: m.time,
  content: m.characters.length === characters.length ? "合唱" : m.characters.map(c => characters[c].cv).join(' ')
}))

function App() {
  const audio = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  function ontimeupdate() {
    setCurrentTime(audio.current.currentTime + 0.3);
    requestAnimationFrame(ontimeupdate);
  }

  useEffect(() => {
    if (audio.current === null) return;
    ontimeupdate()
  }, [])

  return (
    <>
      <Component items={[{
        time: 1,
        content: '这是第一秒展示的内容'
      }, {
        time: 69,
        content: '这是第69秒展示的内容'
      }]}
        currentTime={0}
        scale={0.2}
        totalTime={91} />

      <Component items={items} currentTime={currentTime} scale={10} totalTime={audio.current?.duration} />
      <Component items={characterItems} currentTime={currentTime} scale={5} totalTime={audio.current?.duration} />
      <audio src='/index.mp3' controls ref={audio} style={{ width: '100%' }} />
    </>
  );
}

export default App;
