// 画质档位。选过的档位记在这台电脑的浏览器里（性能差的机器选省电，性能好的选高画质，各记各的）。
//   pr：渲染分辨率倍数（不超过屏幕本身的倍数），minPR：持续掉帧时最多降到多少
//   ao：环境光遮蔽（aoScale 是它的分辨率，aoSamples 是采样数），bloom：泛光
//   shadow：阳光影子贴图的边长，lights：同时亮着的真灯数
//   fps：操作时的帧率上限（0 = 跟显示器一样快），idle：停下来不动时的帧率
export const QUALITY = {
  low: { label: '省电', pr: 0.75, minPR: 0.5, ao: false, aoScale: 0.5, bloom: false, shadow: 1024, lights: 4, fps: 30, idle: 20 },
  mid: { label: '均衡', pr: 1.25, minPR: 0.75, ao: true, aoScale: 0.5, bloom: true, shadow: 2048, lights: 8, fps: 60, idle: 30 },
  high: { label: '高画质', pr: 1.5, minPR: 1.0, ao: true, aoScale: 0.5, aoSamples: 12, bloom: true, shadow: 2048, lights: 10, fps: 60, idle: 60 },
  ultra: { label: '极致', pr: 2, minPR: 1.25, ao: true, aoScale: 1, aoSamples: 16, bloom: true, shadow: 4096, lights: 12, fps: 0, idle: 60 },
};
export const QUALITY_KEYS = Object.keys(QUALITY);

// 地址里的 ?q=low|mid|high|ultra 优先，其次是这台电脑上次选的，都没有就用均衡
export function initialQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (QUALITY[q]) return q;
  try { const s = localStorage.getItem('dorm.quality'); if (QUALITY[s]) return s; } catch { /* 存不了就用默认 */ }
  return 'mid';
}

export function saveQuality(k) {
  try { localStorage.setItem('dorm.quality', k); } catch { /* 无痕模式下存不了，没关系 */ }
}
