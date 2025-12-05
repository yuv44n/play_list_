const startBtn = document.getElementById('start-btn');
const deleteBtn = document.getElementById('delete-btn');
const taskListEl = document.getElementById('task-list');
const tasklistNameEl = document.getElementById('tasklist-name');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const playtimeRemaining = document.getElementById('playtime-remaining');

const STORAGE_KEY = 'tasklist_data';
const YOUTUBE_API_KEY = window.ENV?.YOUTUBE_API_KEY || '';

function getStoredData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearData() {
  localStorage.removeItem(STORAGE_KEY);
}

function showButton(state) {
  if (state === 'none') {
    startBtn.style.display = 'block';
    deleteBtn.style.display = 'none';
  } else {
    startBtn.style.display = 'none';
    deleteBtn.style.display = 'block';
  }
}

function extractPlaylistId(url) {
  const regex = /[?&]list=([^&]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function fetchPlaylistDetails(playlistId) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      return data.items[0].snippet.title;
    }
    return null;
  } catch (error) {
    console.error('Error fetching playlist details:', error);
    return null;
  }
}

async function fetchPlaylistVideos(playlistId) {
  try {
    let allVideos = [];
    let nextPageToken = '';
    do {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&pageToken=${nextPageToken}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error('YouTube API Error:', data.error);
        return null;
      }
      if (data.items) {
        const videos = data.items
          .filter(item => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
          .map(item => ({
            title: item.snippet.title,
            videoId: item.snippet.resourceId.videoId,
            position: item.snippet.position
          }));
        allVideos = allVideos.concat(videos);
      }
      nextPageToken = data.nextPageToken || '';
    } while (nextPageToken && allVideos.length < 200);
    allVideos.sort((a, b) => a.position - b.position);

    for (let i = 0; i < allVideos.length; i += 50) {
      const batch = allVideos.slice(i, i + 50);
      const ids = batch.map(v => v.videoId).join(',');
      const resp = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`
      );
      const details = await resp.json();
      if (details.items) {
        details.items.forEach((item, idx) => {
          batch[idx].duration = item.contentDetails.duration;
        });
      }
    }
    return allVideos;
  } catch (error) {
    console.error('Error fetching playlist videos:', error);
    return null;
  }
}

async function promptTaskList() {
  let playlistUrl = prompt('Enter YouTube playlist URL:');
  if (!playlistUrl) return;
  
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    alert('Invalid YouTube playlist URL. Please make sure the URL contains a playlist ID.');
    return;
  }
  
  tasklistNameEl.textContent = 'Loading playlist...';
  progressText.textContent = 'Loading...';
  showButton('exists');
  
  const [playlistTitle, videos] = await Promise.all([
    fetchPlaylistDetails(playlistId),
    fetchPlaylistVideos(playlistId)
  ]);
  
  if (!videos || videos.length === 0) {
    alert('Could not fetch playlist videos. Please check if the playlist exists and is public.');
    tasklistNameEl.textContent = '';
    progressText.textContent = '0%';
    showButton('none');
    return;
  }
  
  const displayName = playlistTitle || 'YouTube Playlist';
  
  const data = {
    name: displayName,
    playlistId: playlistId,
    videos: videos,
    total: videos.length,
    completed: [],
  };
  
  saveData(data);
  render(data);
}

function render(data) {
  if (!data) {
    tasklistNameEl.textContent = '';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    playtimeRemaining.textContent = '';
    taskListEl.innerHTML = '';
    showButton('none');
    return;
  }
  tasklistNameEl.textContent = data.name;
  showButton('exists');
  // Progress
  const percent = Math.round(data.completed.length / data.total * 100);
  progressBar.style.width = percent + '%';
  progressText.textContent = `${data.completed.length}/${data.total} (${percent}%)`;

  // Playtime calculation
  let totalSeconds = 0;
  let remainingSeconds = 0;
  for (let i = 0; i < data.videos.length; i++) {
    const seconds = parseISODuration(data.videos[i].duration || 'PT0S');
    totalSeconds += seconds;
    if (!data.completed.includes(i)) {
      remainingSeconds += seconds;
    }
  }
  playtimeRemaining.textContent = `Total Playtime remaining: ${formatSeconds(remainingSeconds)}`;

  // Videos
  taskListEl.innerHTML = '';
  for (let i = 0; i < data.videos.length; i++) {
    const li = document.createElement('li');
    li.className = 'task-item' + (data.completed.includes(i) ? ' completed' : '');
    const numberSpan = document.createElement('span');
    numberSpan.className = 'video-number';
    numberSpan.textContent = `${i + 1} | `;
    const titleSpan = document.createElement('span');
    titleSpan.textContent = data.videos[i].title;
    li.appendChild(numberSpan);
    li.appendChild(titleSpan);
    li.onclick = () => {
      toggleTask(i, data);
    };
    taskListEl.appendChild(li);
  }
  
function parseISODuration(iso) {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const [, h, m, s] = iso.match(regex) || [];
  return (parseInt(h || '0') * 3600) + (parseInt(m || '0') * 60) + (parseInt(s || '0'));
}

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h} hours ${m} minutes`;
}
}

function toggleTask(idx, data) {
  const done = data.completed.includes(idx);
  if (done) {
    data.completed = data.completed.filter(x => x !== idx);
  } else {
    data.completed.push(idx);
  }
  saveData(data);
  render(data);
}

startBtn.onclick = promptTaskList;
deleteBtn.onclick = () => {
  if (confirm('Delete current playlist and start new?')) {
    clearData();
    promptTaskList();
  }
};

window.onload = () => {
  const data = getStoredData();
  render(data);
};
