/* 구술기록 프로토타입 — 화면은 data/*.json을 렌더링만 함(콘텐츠 하드코딩 금지, 기획설계서 3.1 원칙 6)
   화면: OH-01 홈 / OH-03 구술자 / OH-04 세그먼트 재생 / OH-05 주제로 보기 / OH-07 지도 / OH-08 인명 사전 */
(function(){
  "use strict";

  var CFG = window.OH_CONFIG || {};
  var FILES = ["site","narrators","sessions","segments","topics","assemblies","places","persons","mentions"];
  var D = null, X = {};
  var main = document.getElementById("main");
  var P = null;                /* 재생 상태 */
  var firstRoute = true;

  /* ============================================================ 공통 도구 */
  function $(s, r){ return (r || document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function pad(n){ return String(n).padStart(2, "0"); }
  function sec(tc){
    if (!tc) return 0;
    var a = tc.split(":");
    return (+a[0]) * 3600 + (+a[1]) * 60 + parseFloat(a[2]);
  }
  function clock(t){
    t = Math.max(0, Math.floor(t + 0.0001));
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h ? h + ":" + pad(m) : pad(m)) + ":" + pad(s);
  }
  function clockFull(t){
    t = Math.max(0, Math.floor(t));
    return pad(Math.floor(t / 3600)) + ":" + pad(Math.floor(t % 3600 / 60)) + ":" + pad(t % 60);
  }
  function durK(t){
    t = Math.round(t);
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h ? h + "시간 " : "") + (m ? m + "분" : "") + (!h && s ? (m ? " " : "") + s + "초" : "");
  }
  function dateK(d){ if (!d) return ""; var a = d.split("-"); return a[0] + ". " + (+a[1]) + ". " + (+a[2]) + "."; }
  function store(k, v){
    try { if (v === undefined) return localStorage.getItem("oh." + k); localStorage.setItem("oh." + k, v); } catch(e){ return null; }
  }
  function toast(msg){
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(function(){ t.classList.remove("on"); }, 1800);
  }
  function copy(text, msg){
    function done(){ toast(msg || "복사했습니다"); }
    if (navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback(){
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch(e){ toast("복사하지 못했습니다"); }
      ta.remove();
    }
  }
  function download(name, text){
    var blob = new Blob(["﻿" + text], {type:"text/plain;charset=utf-8"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
    toast(name + " 내려받기");
  }
  var CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  var CHO_FOLD = {"ㄲ":"ㄱ","ㄸ":"ㄷ","ㅃ":"ㅂ","ㅆ":"ㅅ","ㅉ":"ㅈ"};
  var CHO_LIST = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  function initial(name){
    var c = name.charCodeAt(0) - 0xAC00;
    if (c < 0 || c > 11171) return name[0];
    var ch = CHO[Math.floor(c / 588)];
    return CHO_FOLD[ch] || ch;
  }
  function jong(w){ var c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 !== 0; }
  function eul(w){ return w + (jong(w) ? "을" : "를"); }

  /* ============================================================ 데이터 */
  function loadData(){
    if (location.protocol === "file:"){
      /* 파일을 바로 열었을 때는 JSON을 읽을 수 없으므로 묶음 파일을 씀 */
      return new Promise(function(res, rej){
        var s = document.createElement("script");
        s.src = "data/bundle.js";
        s.onload = function(){ res(window.OH_DATA); };
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    return Promise.all(FILES.map(function(f){
      return fetch("data/" + f + ".json", {cache:"no-cache"}).then(function(r){ return r.json(); });
    })).then(function(arr){ var o = {}; FILES.forEach(function(f, i){ o[f] = arr[i]; }); return o; });
  }

  function buildIndex(){
    function map(arr, k){ var o = {}; arr.forEach(function(x){ o[x[k]] = x; }); return o; }
    X.nar = map(D.narrators, "id");
    X.ses = map(D.sessions, "id");
    X.seg = map(D.segments, "id");
    X.topic = map(D.topics.topics, "id");
    X.event = map(D.topics.events, "id");
    X.place = map(D.places, "place_id");
    X.person = map(D.persons, "person_id");
    X.segsBySes = {}; X.sesByNar = {}; X.para = {};
    D.sessions.forEach(function(s){ (X.sesByNar[s.narrator_id] = X.sesByNar[s.narrator_id] || []).push(s); });
    Object.keys(X.sesByNar).forEach(function(k){ X.sesByNar[k].sort(function(a, b){ return a.seq - b.seq; }); });
    D.segments.forEach(function(s){
      (X.segsBySes[s.session_id] = X.segsBySes[s.session_id] || []).push(s);
      s.transcript_sync.forEach(function(p, i){ X.para[p.id] = {seg:s, p:p, i:i}; });
    });
    Object.keys(X.segsBySes).forEach(function(k){ X.segsBySes[k].sort(function(a, b){ return a.seq - b.seq; }); });
    X.order = [];
    D.narrators.forEach(function(n){ (X.sesByNar[n.id] || []).forEach(function(s){ X.order = X.order.concat(X.segsBySes[s.id] || []); }); });
    /* 이용자 화면에 드러내는 언급: 확정 상태 + 공개 항목 + 방문 열람 구간 제외(8.6) */
    X.pub = D.mentions.filter(function(m){
      if (m.status !== "CONFIRMED") return false;
      var s = X.seg[m.segment_id];
      if (!s || s.access_level === "onsite") return false;
      var e = entity(m.entity_type, m.entity_id);
      return e && (m.entity_type === "PLACE" ? e.is_public : e.is_public_figure);
    });
    X.byEnt = {}; X.byPara = {}; X.bySeg = {};
    X.pub.forEach(function(m){
      var k = m.entity_type + "|" + m.entity_id;
      (X.byEnt[k] = X.byEnt[k] || []).push(m);
      (X.byPara[m.paragraph_id] = X.byPara[m.paragraph_id] || []).push(m);
      (X.bySeg[m.segment_id] = X.bySeg[m.segment_id] || []).push(m);
    });
    X.nameCount = {};
    D.persons.forEach(function(p){ if (p.is_public_figure) X.nameCount[p.name] = (X.nameCount[p.name] || 0) + 1; });
  }
  function entity(type, id){ return type === "PLACE" ? X.place[id] : X.person[id]; }
  function sesOf(seg){ return X.ses[seg.session_id]; }
  function narOf(seg){ return X.nar[sesOf(seg).narrator_id]; }
  function segStart(seg){ return sec(seg.start_tc); }
  function segEnd(seg){ return sec(seg.end_tc); }
  function segDur(seg){ return segEnd(seg) - segStart(seg); }
  function hasVideo(seg){
    if (seg.access_level === "full") return !!sesOf(seg).video_url;
    if (seg.access_level === "highlight") return !!seg.video_url;
    return false;
  }
  function mediaOf(seg){
    var s = sesOf(seg);
    if (seg.access_level === "highlight")
      return { src: seg.video_url, vtt: seg.video_url.replace(/\.mp4$/, ".vtt"), offset: sec(seg.clip_offset_tc || seg.start_tc), poster: thumb(seg), clip: true };
    return { src: s.video_url, vtt: s.captions_url, offset: 0, poster: thumb(seg), clip: false };
  }
  function thumb(seg){ return "media/thumbs/" + seg.id + ".jpg"; }
  function lvl(level, short){
    var L = D.site.access_levels[level];
    return '<span class="lvl ' + level + '">' + esc(short ? L.short : L.label) + '</span>';
  }
  function segHref(seg, t){ return "#/segment/" + seg.id + (t != null ? "?t=" + t.toFixed(1) : ""); }
  function topicLabel(id){ return (X.topic[id] || X.event[id] || {label:id}).label; }
  function firstMentionT(ms){ return ms.reduce(function(a, m){ return Math.min(a, sec(m.tc)); }, Infinity); }
  function groupBySeg(ms){
    var o = {}, order = [];
    ms.forEach(function(m){ if (!o[m.segment_id]){ o[m.segment_id] = []; order.push(m.segment_id); } o[m.segment_id].push(m); });
    order.sort(function(a, b){ return X.order.indexOf(X.seg[a]) - X.order.indexOf(X.seg[b]); });
    return order.map(function(id){ return {seg:X.seg[id], ms:o[id]}; });
  }
  /* 언급이 들어 있는 문장 — 인명·지명 항목의 인용 미리보기에 씀 */
  function sentenceOf(m){
    var p = X.para[m.paragraph_id].p, t = p.text, i = m.char_start == null ? t.indexOf(m.surface) : m.char_start;
    var a = Math.max(t.lastIndexOf(". ", i), t.lastIndexOf("? ", i), t.lastIndexOf("! ", i));
    a = a < 0 ? 0 : a + 2;
    var b = t.slice(i).search(/[.?!](\s|$)/);
    b = b < 0 ? t.length : i + b + 1;
    var s = t.slice(a, b);
    var j = i - a;
    return esc(s.slice(0, j)) + "<mark>" + esc(m.surface) + "</mark>" + esc(s.slice(j + m.surface.length));
  }

  /* ============================================================ 예시 이미지(1차 프로토타입과 같은 도형 문법) */
  var PAL = [
    ["#E4DACB","#C6A87C","#8A6C45","#4A3A26"], ["#DCE3DD","#A9BFB2","#5F8274","#2E4A40"],
    ["#E6DCD6","#CDA98C","#A5714E","#5E3A24"], ["#E2E0E6","#BEB8C6","#8A8296","#4B4455"],
    ["#E3E1D8","#BFBBA6","#8E8A72","#4B4838"], ["#E0E4E6","#B4C0C4","#7E8D93","#3E4B50"]
  ];
  function abstractSVG(seed, palIdx, dense){
    var c = PAL[palIdx % PAL.length], s = seed, out = "";
    function rnd(max){ s = (s * 1103515245 + 12345) >>> 0; return s % max; }
    for (var i = 0; i < (dense ? 9 : 6); i++){
      var col = c[1 + (i % 3)], op = (0.4 + rnd(35) / 100).toFixed(2), kind = rnd(4);
      var cx = 40 + rnd(320), cy = 40 + rnd(320), r = 46 + rnd(150);
      if (kind === 0) out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + col + '" opacity="' + op + '"/>';
      else if (kind === 1){
        var w = 70 + rnd(220), h = 60 + rnd(200);
        out += '<rect x="' + (cx - w / 2) + '" y="' + (cy - h / 2) + '" width="' + w + '" height="' + h + '" fill="' + col + '" opacity="' + op + '" transform="rotate(' + (rnd(90) - 45) + ' ' + cx + ' ' + cy + ')"/>';
      } else if (kind === 2) out += '<path d="M' + cx + ',' + (cy - r) + ' A' + r + ',' + r + ' 0 0 1 ' + cx + ',' + (cy + r) + ' Z" fill="' + col + '" opacity="' + op + '" transform="rotate(' + rnd(360) + ' ' + cx + ' ' + cy + ')"/>';
      else out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + (6 + rnd(16)) + '" opacity="' + op + '"/>';
    }
    return '<svg class="viz" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="mix-blend-mode:multiply">' + out + '</svg>';
  }
  var SCENES = {
    0: function(c){ return '<rect width="320" height="200" fill="' + c[0] + '"/><rect y="34" width="320" height="96" fill="' + c[1] + '"/>' +
      '<path d="M0,130 H320 V200 H0 Z" fill="' + c[2] + '"/><circle cx="160" cy="58" r="26" fill="' + c[3] + '" opacity=".22"/>' +
      '<g fill="' + c[3] + '" opacity=".45"><rect x="18" y="96" width="26" height="34" rx="10"/><rect x="56" y="102" width="26" height="28" rx="10"/>' +
      '<rect x="238" y="100" width="26" height="30" rx="10"/><rect x="276" y="94" width="26" height="36" rx="10"/></g>' +
      '<rect x="118" y="150" width="84" height="50" fill="' + c[3] + '"/><circle cx="160" cy="96" r="17" fill="' + c[3] + '"/>' +
      '<path d="M132,150 C132,126 146,116 160,116 C174,116 188,126 188,150 Z" fill="' + c[3] + '"/>'; },
    1: function(c){ return '<rect width="320" height="200" fill="' + c[0] + '"/><rect width="320" height="118" fill="' + c[1] + '"/>' +
      '<g fill="' + c[3] + '"><circle cx="70" cy="72" r="16"/><path d="M46,118 C46,96 56,86 70,86 C84,86 94,96 94,118 Z"/>' +
      '<circle cx="160" cy="64" r="18"/><path d="M133,118 C133,93 145,82 160,82 C175,82 187,93 187,118 Z"/>' +
      '<circle cx="250" cy="74" r="15"/><path d="M228,118 C228,98 237,88 250,88 C263,88 272,98 272,118 Z"/></g>' +
      '<rect y="118" width="320" height="12" fill="' + c[2] + '"/><rect y="130" width="320" height="70" fill="' + c[3] + '" opacity=".85"/>'; },
    2: function(c){ return '<rect width="320" height="200" fill="' + c[0] + '"/><path d="M0,92 L54,52 L108,92 Z" fill="' + c[1] + '"/>' +
      '<rect x="130" y="40" width="58" height="80" fill="' + c[1] + '"/><rect x="206" y="62" width="76" height="58" fill="' + c[2] + '" opacity=".8"/>' +
      '<rect y="120" width="320" height="80" fill="' + c[2] + '"/>' +
      '<g fill="' + c[3] + '"><circle cx="88" cy="118" r="13"/><path d="M68,168 C68,140 76,130 88,130 C100,130 108,140 108,168 Z"/>' +
      '<circle cx="132" cy="112" r="15"/><path d="M110,172 C110,142 119,130 132,130 C145,130 154,142 154,172 Z"/>' +
      '<circle cx="178" cy="120" r="12"/><path d="M160,166 C160,141 168,132 178,132 C188,132 196,141 196,166 Z"/></g>'; },
    3: function(c){ return '<rect width="320" height="200" fill="' + c[0] + '"/><rect width="320" height="86" fill="' + c[1] + '"/>' +
      '<rect x="88" y="16" width="144" height="46" fill="' + c[2] + '" opacity=".6"/>' +
      '<g fill="' + c[3] + '"><circle cx="62" cy="92" r="14"/><path d="M40,134 C40,110 49,102 62,102 C75,102 84,110 84,134 Z"/>' +
      '<circle cx="128" cy="84" r="15"/><path d="M105,132 C105,106 115,96 128,96 C141,96 151,106 151,132 Z"/>' +
      '<circle cx="196" cy="86" r="15"/><path d="M173,132 C173,107 183,98 196,98 C209,98 219,107 219,132 Z"/>' +
      '<circle cx="260" cy="94" r="13"/><path d="M240,134 C240,112 248,104 260,104 C272,104 280,112 280,134 Z"/></g>' +
      '<ellipse cx="160" cy="164" rx="140" ry="34" fill="' + c[3] + '"/><ellipse cx="160" cy="158" rx="128" ry="27" fill="' + c[2] + '"/>'; },
    5: function(c){ return '<rect width="320" height="200" fill="' + c[0] + '"/><rect width="320" height="104" fill="' + c[1] + '"/>' +
      '<rect x="56" y="18" width="208" height="40" fill="' + c[3] + '" opacity=".3"/>' +
      '<g fill="' + c[3] + '"><circle cx="112" cy="82" r="16"/><path d="M88,140 C88,110 98,100 112,100 C126,100 136,110 136,140 Z"/>' +
      '<circle cx="208" cy="82" r="16"/><path d="M184,140 C184,110 194,100 208,100 C222,100 232,110 232,140 Z"/>' +
      '<path d="M136,120 H184 V130 H136 Z"/></g>' +
      '<rect y="140" width="320" height="60" fill="' + c[2] + '"/><rect x="118" y="150" width="84" height="12" fill="' + c[0] + '" opacity=".75"/>'; },
    4: function(c){ return '<rect width="320" height="200" fill="' + c[1] + '"/><rect y="24" width="320" height="58" fill="' + c[2] + '" opacity=".55"/>' +
      '<g stroke="' + c[0] + '" stroke-width="3" opacity=".5"><path d="M24,44 H120 M24,62 H96 M200,44 H296 M224,62 H296"/></g>' +
      '<circle cx="160" cy="90" r="22" fill="' + c[3] + '"/><path d="M112,200 C112,146 132,124 160,124 C188,124 208,146 208,200 Z" fill="' + c[3] + '"/>' +
      '<rect x="60" y="160" width="200" height="40" fill="' + c[0] + '" opacity=".9"/><g stroke="' + c[3] + '" stroke-width="2" opacity=".5"><path d="M76,172 H170 M76,182 H150 M76,192 H160"/></g>'; }
  };
  function sceneSVG(n, shift){
    var sc = n.photo.scene, keys = [0, 1, 2, 3, 4, 5];
    if (shift) sc = keys[(keys.indexOf(sc) + shift) % keys.length];
    var c = PAL[(n.photo.palette + (shift || 0)) % PAL.length], f = SCENES[sc] || SCENES[0];
    return '<svg class="viz" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + esc(n.name) + ' 활동 사진 자리(예시 이미지)">' + f(c) + '</svg>';
  }

  /* ============================================================ 공통 조각 */
  function crumb(items){
    return '<nav class="crumb" aria-label="현재 위치"><a href="#/">구술기록</a>' + items.map(function(it){
      return '<span aria-hidden="true">›</span>' + (it[1] ? '<a href="' + it[1] + '">' + esc(it[0]) + '</a>' : '<span aria-current="page">' + esc(it[0]) + '</span>');
    }).join("") + '</nav>';
  }
  function segCard(seg, o){
    o = o || {};
    var n = narOf(seg), s = sesOf(seg), t = o.t != null ? o.t : null;
    var video = hasVideo(seg);
    var badge = seg.access_level === "transcript_only" ? '<span class="dur">녹취문</span>' : seg.access_level === "onsite" ? '<span class="dur">방문 열람</span>' : '<span class="dur">' + clock(segDur(seg)) + '</span>';
    return '<article class="scard">' +
      (o.noThumb ? "" : '<div class="th"><img src="' + thumb(seg) + '" alt="" loading="lazy"' + (video ? "" : ' style="filter:grayscale(1);opacity:.55"') + '>' + badge + '</div>') +
      '<div class="bd"><div class="who">' + esc(n.name) + ' · 제' + s.seq + '차 채록 · ' + pad(seg.seq) + '</div>' +
      '<h3><a href="' + segHref(seg, t) + '">' + esc(seg.title) + '</a></h3>' +
      (o.snip ? '<p class="snip">' + o.snip + '</p>' : "") +
      (o.summary ? '<p class="sum">' + esc(seg.summary) + '</p>' : "") +
      '<div class="ft">' + lvl(seg.access_level, true) + (o.extra ? '<span>' + o.extra + '</span>' : "") + '</div></div></article>';
  }
  function narSegs(n){ return (X.sesByNar[n.id] || []).reduce(function(a, s){ return a.concat(X.segsBySes[s.id] || []); }, []); }
  /* 구술자 공개 상태: 온라인으로 들을·읽을 세그먼트가 있으면 online, 목록·요약만 있으면 onsite, 채록만 끝났으면 processing */
  function narStatus(n){
    var segs = narSegs(n);
    if (segs.some(function(g){ return g.access_level !== "onsite"; })) return "online";
    if (segs.length || (X.sesByNar[n.id] || []).some(function(s){ return s.status === "onsite"; })) return "onsite";
    return "processing";
  }
  function sesStatus(s){ return s.status || "online"; }
  function narYears(n){
    var ys = (X.sesByNar[n.id] || []).map(function(s){ return s.date.slice(0, 4); }).filter(function(v, i, a){ return a.indexOf(v) === i; });
    return ys.join("·");
  }
  function narPublished(n){
    return (X.sesByNar[n.id] || []).reduce(function(a, s){ return s.published_at && s.published_at > a ? s.published_at : a; }, "");
  }
  /* 구술자 카드 — 국회의원 컬렉션 카드 문법(활동 사진·성명·직위). 공개 상태는 사진의 색으로만 구분함 */
  function narCard(n){
    var st = narStatus(n), ss = X.sesByNar[n.id] || [], q = n.representative_quotes[0];
    var label = n.name + ", " + n.headline_position + ", " + D.site.narrator_status[st];
    return '<article class="ncard' + (st === "online" ? "" : " gray") + '"><div class="ph">' + sceneSVG(n) +
      (q ? '<p class="qt" aria-hidden="true">“' + esc(q.text) + '”</p>' : '') + '</div>' +
      '<h3><a class="cardlink" href="#/narrator/' + n.id + '" aria-label="' + esc(label) + '">' + esc(n.name) + '</a></h3>' +
      '<div class="pos">' + esc(n.headline_position) + '</div>' +
      '<div class="meta">' + narYears(n) + '년 채록 · ' + ss.length + '회</div></article>';
  }
  function debounce(fn, ms){ var t; return function(){ var a = arguments, me = this; clearTimeout(t); t = setTimeout(function(){ fn.apply(me, a); }, ms); }; }

  /* 색인(Index) 항목 — OHMS 방식: 부분 녹취·요약·키워드·주제·장소·인물·관련 링크와 [구간 재생][구간 링크] */
  function ixItem(g, o){
    o = o || {};
    var n = narOf(g), lv = g.access_level;
    var first = g.transcript_sync.filter(function(p){ return p.speaker === n.name; })[0];
    var partial = first ? first.text.slice(0, 72) + (first.text.length > 72 ? "…" : "") : "";
    var ek = [];
    (X.bySeg[g.id] || []).forEach(function(m){ var k = m.entity_type + "|" + m.entity_id; if (ek.indexOf(k) < 0) ek.push(k); });
    var here = o.here && g === o.here && hasVideo(g);
    var play = here ? '<button type="button" class="btn sm" data-seek="' + segStart(g) + '">처음부터 재생</button>'
      : '<a class="btn sm" href="' + segHref(g) + (o.here && hasVideo(g) ? '?autoplay=1' : '') + '">' + (hasVideo(g) ? "이 구간 재생" : lv === "onsite" ? "구간 정보" : "녹취문 보기") + '</a>';
    return '<details class="ixi' + (o.cur ? " cur" : "") + '" data-sid="' + g.id + '"' + (o.open ? " open" : "") + '>' +
      '<summary><span class="n">' + pad(g.seq) + '</span><span class="t">' + esc(g.title) + '</span>' +
      '<span class="m tnum">' + (lv === "onsite" ? durK(segDur(g)) : clock(segStart(g)) + '–' + clock(segEnd(g))) + ' ' + lvl(lv, true) + '</span></summary>' +
      '<div class="ixb">' +
        (partial && lv !== "onsite" ? '<p><b>부분 녹취</b><span class="pt">“' + esc(partial) + '”</span></p>' : '') +
        '<p><b>요약</b><span>' + esc(g.summary) + '</span></p>' +
        ((g.keywords || []).length ? '<p><b>키워드</b><span class="tags">' + g.keywords.map(function(k){ return '<a class="tag" href="#/search?q=' + encodeURIComponent(k) + '">' + esc(k) + '</a>'; }).join("") + '</span></p>' : '') +
        (g.topics.length ? '<p><b>주제</b><span class="tags">' + g.topics.map(function(t){ return '<a class="tag" href="#/explore?axis=topic&id=' + t + '">' + esc(topicLabel(t)) + '</a>'; }).join("") + '</span></p>' : '') +
        (ek.length ? '<p><b>장소·인물</b><span class="ents-list">' + ek.map(function(k){ var a = k.split("|"); return entButton(k, entity(a[0], a[1]).name, a[0] === "PLACE" ? "place" : "person"); }).join("") + '</span></p>' : '') +
        ((g.hyperlinks || []).length ? '<p><b>관련 링크</b><span>' + linksHTML(g.hyperlinks) + '</span></p>' : '') +
        '<div class="acts">' + play + '<button type="button" class="btn sm" data-copy="seglink" data-id="' + g.id + '">구간 링크 복사</button></div>' +
      '</div></details>';
  }
  function linksHTML(ls){
    return ls.map(function(l){
      return l.url ? '<a class="xl" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '↗</a>' : '<span class="xl off">' + esc(l.label) + '</span>';
    }).join("");
  }
  /* 이 구술 안에서 찾기 — OHMS 'Search This Index'. 제목·요약·키워드·녹취문(방문 열람 제외)에서 찾음 */
  function ixSearchBox(){
    return '<div class="ixs"><label class="sr" for="ixq">이 구술 안에서 찾기</label><input id="ixq" type="search" placeholder="이 구술 안에서 찾기 (제목·요약·키워드·녹취문)" autocomplete="off">' +
      '<p id="ixcount" class="note" aria-live="polite"></p><ol id="ixhits" class="ixhits"></ol></div>';
  }
  function bindIxSearch(segs, root, inPlayer){
    var inp = $("#ixq", root); if (!inp) return;
    inp.addEventListener("input", debounce(function(){
      var term = inp.value.trim(), lt = term.toLowerCase(), hits = [], segHit = {};
      if (term) segs.forEach(function(g){
        var where = [];
        if (g.title.toLowerCase().indexOf(lt) > -1) where.push("제목");
        if (g.summary.toLowerCase().indexOf(lt) > -1) where.push("요약");
        if ((g.keywords || []).some(function(k){ return k.toLowerCase().indexOf(lt) > -1; })) where.push("키워드");
        if (where.length){ segHit[g.id] = 1; hits.push({g:g, t:segStart(g), html:'<i>' + where.join("·") + '</i> ' + hi(g.title, term)}); }
        if (g.access_level !== "onsite") g.transcript_sync.forEach(function(p){
          var i = p.text.toLowerCase().indexOf(lt); if (i < 0) return;
          segHit[g.id] = 1;
          var a = Math.max(p.text.lastIndexOf(". ", i), p.text.lastIndexOf("? ", i)); a = a < 0 ? 0 : a + 2;
          var b = p.text.slice(i).search(/[.?!](\s|$)/); b = b < 0 ? p.text.length : i + b + 1;
          hits.push({g:g, t:sec(p.tc), html:hi(p.text.slice(a, b), term)});
        });
      });
      $("#ixcount", root).textContent = term ? "「" + term + "」 " + hits.length + "건 · 세그먼트 " + Object.keys(segHit).length + "개" : "";
      $("#ixhits", root).innerHTML = hits.slice(0, 30).map(function(h){
        var same = inPlayer && P && h.g === P.seg;
        var lbl = pad(h.g.seq) + " " + h.g.title.split(" — ")[0];
        return '<li>' + (same ? '<button type="button" class="tcj" data-seek="' + h.t + '">' + clock(h.t) + '</button>' : '<a class="tcj" href="' + segHref(h.g, h.t) + (inPlayer && hasVideo(h.g) ? '&autoplay=1' : '') + '">' + clock(h.t) + '</a>') +
          '<span><small>제' + sesOf(h.g).seq + '차 · ' + esc(lbl) + '</small>' + h.html + '</span></li>';
      }).join("");
      $$("details.ixi", root).forEach(function(d){ var on = !!segHit[d.dataset.sid]; d.classList.toggle("hit", on); if (term && on) d.open = true; });
    }, 180));
  }
  function entButton(key, label, cls){
    return '<button type="button" class="' + cls + '" data-ent="' + key + '" aria-haspopup="dialog">' + esc(label) + '</button>';
  }

  /* ============================================================ 라우터 */
  function parseHash(){
    var h = location.hash.replace(/^#/, "") || "/";
    var i = h.indexOf("?");
    var path = i < 0 ? h : h.slice(0, i);
    return { parts: path.split("/").filter(Boolean), q: new URLSearchParams(i < 0 ? "" : h.slice(i + 1)) };
  }
  function route(){
    closePop(true);
    stopPlayer();
    var r = parseHash(), p = r.parts, nav = p[0] || "home", title = "";
    try {
      switch (p[0] || "home"){
        case "home": title = viewHome(); break;
        case "narrators": title = viewNarrators(r.q); break;
        case "narrator": title = viewNarrator(p[1], r.q); nav = "narrators"; break;
        case "segment": title = viewSegment(p[1], r.q); nav = "narrators"; break;
        case "explore": title = viewExplore(r.q); nav = r.q.get("axis") === "search" || r.q.get("q") ? "search" : "explore"; break;
        case "search": title = viewSearch(r.q); break;
        case "map": title = viewMap(r.q); break;
        case "place": location.replace("#/map?place=" + encodeURIComponent(p[1] || "")); return;
        case "persons": title = viewPersons(r.q); break;
        case "person": title = viewPerson(p[1]); nav = "persons"; break;
        default: title = viewHome(); nav = "home";
      }
    } catch (e){
      console.error(e);
      main.innerHTML = '<div class="wrap"><p class="empty">화면을 만들지 못했습니다: ' + esc(e.message) + '</p></div>';
    }
    $$(".ohnav [data-nav]").forEach(function(a){
      if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = (title ? title + " — " : "") + "구술기록 — 국회기록원 (프로토타입)";
    if (!r.q.get("keep")) window.scrollTo(0, 0);
    if (!firstRoute) main.focus({preventScroll:true});
    firstRoute = false;
  }
  /* ?to=요소ID — 화면을 그린 뒤 해당 영역으로 스크롤 */
  function scrollToParam(q){
    var to = q && q.get("to");
    if (to) setTimeout(function(){ var el = document.getElementById(to); if (el) window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - 70}); }, 30);
  }
  function go(h){ if (location.hash === h) route(); else location.hash = h; }

  /* ============================================================ OH-01 구술기록 홈 */
  function viewHome(){
    var S = D.site.home;
    var totalSec = D.sessions.reduce(function(a, s){ return a + sec(s.duration); }, 0);
    var entCount = Object.keys(X.byEnt).length;
    var fid = S.featured_segments[Math.floor(Date.now() / 864e5) % S.featured_segments.length];
    var f = X.seg[fid], fn = narOf(f), fs = sesOf(f);
    var q = (fn.representative_quotes.filter(function(x){ return x.segment_id === fid; })[0]) || null;
    var qt = q ? q.text : f.summary;
    var qT = q ? sec(X.para[q.paragraph_id].p.tc) : null;

    var topicCount = {};
    D.segments.forEach(function(s){ s.topics.forEach(function(t){ topicCount[t] = (topicCount[t] || 0) + 1; }); });
    var chips = S.topic_chips.map(function(id){
      return '<a class="chip" href="#/explore?axis=topic&id=' + id + '">' + esc(topicLabel(id)) + '<small>' + (topicCount[id] || 0) + '</small></a>';
    }).join("");

    var cx = S.cross_example, crossSegs = [], seen = {};
    X.order.forEach(function(s){
      var nid = sesOf(s).narrator_id;
      if (s.topics.indexOf(cx.topic) > -1 && !seen[nid] && crossSegs.length < 2){ seen[nid] = 1; crossSegs.push(s); }
    });

    var places = D.places.filter(function(p){ return p.is_public && X.byEnt["PLACE|" + p.place_id]; })
      .sort(function(a, b){ return X.byEnt["PLACE|" + b.place_id].length - X.byEnt["PLACE|" + a.place_id].length; }).slice(0, 4);
    var persons = D.persons.filter(function(p){ return p.is_public_figure && X.byEnt["PERSON|" + p.person_id]; })
      .sort(function(a, b){ return X.byEnt["PERSON|" + b.person_id].length - X.byEnt["PERSON|" + a.person_id].length; }).slice(0, 4);

    var recent = D.sessions.filter(function(s){ return s.published_at && (X.segsBySes[s.id] || []).length; })
      .sort(function(a, b){ return a.published_at < b.published_at ? 1 : -1; });

    main.innerHTML =
      '<section class="hero"><div class="art" aria-hidden="true">' + abstractSVG(20260914, 1, true) + '</div><div class="wrap"><div class="txt">' +
        '<p class="kicker">' + esc(S.kicker) + '</p>' +
        '<h1>' + S.headline.map(esc).join("<br>") + '</h1>' +
        '<p class="lede">' + esc(S.lede) + '</p>' +
        '<dl class="figs"><div><dt>구술자</dt><dd class="tnum">' + D.narrators.length + '<small>명</small></dd></div>' +
        '<div><dt>주제 세그먼트</dt><dd class="tnum">' + D.segments.length + '<small>개</small></dd></div>' +
        '<div><dt>채록 시간</dt><dd class="tnum">' + (Math.round(totalSec / 360) / 10) + '<small>시간</small></dd></div>' +
        '<div><dt>언급된 장소·인물</dt><dd class="tnum">' + entCount + '<small>곳·명</small></dd></div></dl>' +
      '</div></div></section>' +

      '<section class="sec"><div class="wrap">' +
        '<div class="sec-head"><div><div class="no">01</div><h2>오늘의 증언</h2></div><p class="d">긴 구술 전체가 아니라 한 대목부터 시작합니다. 자동으로 재생하지 않으며, 누르면 해당 대목의 재생 화면으로 이동합니다.</p></div>' +
        '<div class="feature"><a class="visual" href="' + segHref(f, qT) + '" aria-label="' + esc(f.title) + ' 재생 화면으로"><img src="' + esc(thumb(f)) + '" alt=""' + (hasVideo(f) ? '' : ' style="filter:grayscale(1);opacity:.6"') + '><span class="play"><i></i>' + (hasVideo(f) ? "이 대목 듣기 · " + clock(segDur(f)) : "녹취문 읽기") + '</span></a>' +
          '<div class="panel"><blockquote>' + esc(qt) + '</blockquote>' +
          '<p class="src"><b>' + esc(fn.name) + '</b> ' + esc(fn.headline_position) + ' · 「' + esc(f.title) + '」 · 제' + fs.seq + '차 채록</p>' +
          '<div class="acts"><a class="btn primary" href="' + segHref(f, qT) + '">이 대목으로 가기</a><a class="btn" href="#/narrator/' + fn.id + '">구술자 소개</a></div></div></div>' +
      '</div></section>' +

      '<section class="sec alt"><div class="wrap">' +
        '<div class="sec-head"><div><div class="no">02</div><h2>주제로 들어가기</h2></div><p class="d">구술을 사람이 아니라 주제로 엽니다. 숫자는 그 주제를 다룬 세그먼트 수입니다.</p></div>' +
        '<div class="chips">' + chips + '</div>' +
        '<p style="margin-top:22px"><a class="btn" href="#/explore">주제·사건·시대 전체 보기</a></p>' +
      '</div></section>' +

      (crossSegs.length === 2 ? '<section class="sec"><div class="wrap">' +
        '<div class="sec-head"><div><div class="no">03</div><h2>같은 사건, 다른 기억</h2></div><p class="d">' + esc(cx.note) + '</p></div>' +
        '<div class="cross">' + segCard(crossSegs[0], {summary:true}) + '<div class="vs" aria-hidden="true">그리고</div>' + segCard(crossSegs[1], {summary:true}) + '</div>' +
        '<p style="margin-top:22px"><a class="btn" href="#/explore?axis=topic&id=' + cx.topic + '">「' + esc(topicLabel(cx.topic)) + '」 교차 증언 모두 보기</a></p>' +
      '</div></section>' : "") +

      '<section class="sec alt"><div class="wrap">' +
        '<div class="sec-head"><div><div class="no">04</div><h2>구술자</h2></div><p class="d">의장단에서 속기사·경위·보좌관·출입기자까지, 국회를 거쳐 간 사람들입니다. 온라인으로 들을 수 있는 구술이 있으면 카드에 색이 들어갑니다.</p></div>' +
        '<div class="hscroll">' + D.narrators.slice().sort(function(a, b){ return (narStatus(a) === "online" ? 0 : 1) - (narStatus(b) === "online" ? 0 : 1); }).map(narCard).join("") + '</div>' +
        '<p style="margin-top:22px"><a class="btn" href="#/narrators">구술자 전체 보기</a></p>' +
      '</div></section>' +

      '<section class="sec"><div class="wrap">' +
        '<div class="sec-head"><div><div class="no">05</div><h2>장소와 인물로 찾기</h2></div><p class="d">구술에서 언급된 지명과 인명을 사전으로 정리했습니다. 같은 장소, 같은 사람을 이야기한 대목이 한곳에 모입니다.</p></div>' +
        '<div class="finders"><div class="finder"><h3>지도로 보는 구술</h3><p>핀을 누르면 그 장소를 언급한 대목 목록이 나오고, 대목을 누르면 그 위치부터 재생합니다.</p><ul>' +
          places.map(function(p){ return '<li><a href="#/map?place=' + p.place_id + '"><span>' + esc(p.name) + '</span><span>언급 ' + X.byEnt["PLACE|" + p.place_id].length + '회</span></a></li>'; }).join("") +
          '</ul><a class="btn go" href="#/map">지도 열기</a></div>' +
        '<div class="finder"><h3>인명 사전</h3><p>호칭이 달라도 같은 사람이면 하나로 묶었습니다. 동명이인은 구분해 두었습니다.</p><ul>' +
          persons.map(function(p){ return '<li><a href="#/person/' + p.person_id + '"><span>' + esc(p.name) + ' <small class="muted">' + esc(p.disambiguation) + '</small></span><span>언급 ' + X.byEnt["PERSON|" + p.person_id].length + '회</span></a></li>'; }).join("") +
          '</ul><a class="btn go" href="#/persons">인명 사전 열기</a></div></div>' +
      '</div></section>' +

      '<section class="sec alt"><div class="wrap">' +
        '<div class="sec-head"><div><div class="no">06</div><h2>최근 공개</h2></div><p class="d">새로 공개한 채록 회차입니다.</p></div>' +
        '<ul class="recent">' + recent.map(function(s){
          var n = X.nar[s.narrator_id], segs = X.segsBySes[s.id] || [];
          return '<li><a href="#/narrator/' + n.id + '"><span class="d tnum">' + dateK(s.published_at) + '</span><span class="t">' + esc(n.name) + ' 구술 제' + s.seq + '차 — ' + esc(segs.map(function(x){ return x.title.split(" — ")[0]; }).slice(0, 2).join(", ")) + ' 외</span>' +
            '<span class="s">' + esc(s.project_name) + ' · 세그먼트 ' + segs.length + '개 · ' + durK(sec(s.duration)) + '</span></a></li>';
        }).join("") + '</ul>' +
      '</div></section>';
    return "";
  }

  /* ============================================================ OH-02 구술자 목록 — 국회의원 컬렉션(SC-01)과 같은 카드 문법 */
  var NST = null;
  function viewNarrators(q){
    NST = { cat: q.get("cat") || "", st: q.get("st") || "", q: q.get("q") || "", ini: q.get("ini") || "", sort: q.get("sort") || "name" };
    var cats = [["", "전체"]].concat(D.site.categories.map(function(c){ return [c, c]; }));
    main.innerHTML = '<section class="lhead"><div class="art" aria-hidden="true">' + abstractSVG(4411, 4) + '</div><div class="wrap">' +
      '<p class="kicker">구술기록</p><h1>구술자</h1><p class="lede">국회를 거쳐 간 사람들의 자리를 두었습니다. 온라인으로 들을 수 있는 구술이 있는 구술자의 카드에는 색이 들어갑니다.</p>' +
      '<div class="terms" role="group" aria-label="구술자 구분">' + cats.map(function(c){
        return '<button type="button" data-ncat="' + esc(c[0]) + '" aria-pressed="' + (NST.cat === c[0]) + '">' + esc(c[1]) + '<span class="tag0" data-ccount="' + esc(c[0]) + '"></span></button>';
      }).join("") + '</div></div></section>' +
      '<section class="toolbar"><div class="wrap">' +
        '<div class="seg" role="group" aria-label="공개 상태">' + [["", "전체"], ["online", "온라인 공개"], ["off", "방문 열람·정리 중"]].map(function(s){
          return '<button type="button" data-nst="' + s[0] + '" aria-pressed="' + (NST.st === s[0]) + '">' + s[1] + '</button>'; }).join("") + '</div>' +
        '<label class="sr" for="nq">성명·직위 검색</label><input class="search" id="nq" type="search" placeholder="성명·직위 검색" value="' + esc(NST.q) + '" autocomplete="off">' +
        '<label class="sr" for="nsort">정렬</label><select class="sel" id="nsort">' + [["name", "가나다순"], ["recent", "최근 공개순"], ["era", "재임 시기순"]].map(function(s){
          return '<option value="' + s[0] + '"' + (NST.sort === s[0] ? " selected" : "") + '>' + s[1] + '</option>'; }).join("") + '</select>' +
        '<div class="idx" id="nidx" role="group" aria-label="초성 색인"></div>' +
      '</div></section>' +
      '<div class="wrap"><div class="resline"><span id="ncount" aria-live="polite"></span>' +
        '<span class="lg"><span><i class="c" aria-hidden="true"></i>온라인 공개 구술 있음</span><span><i class="g" aria-hidden="true"></i>방문 열람·정리 중</span></span></div>' +
      '<div class="ngrid" id="ngrid"></div><p class="estate" id="nempty" hidden>조건에 맞는 구술자가 없습니다.</p>' +
      '<p class="note" style="padding:6px 0 80px;max-width:62em">카드는 국회의원 컬렉션과 같은 문법(활동 사진·성명·직위)으로 두고, 공개 상태는 사진의 색으로만 구분합니다. 카드에 마우스를 올리거나 초점을 두면 대표 인용이 나타납니다.</p></div>';
    $$("[data-ncat]").forEach(function(b){ b.onclick = function(){ NST.cat = b.dataset.ncat; renderNGrid(); }; });
    $$("[data-nst]").forEach(function(b){ b.onclick = function(){ NST.st = b.dataset.nst; renderNGrid(); }; });
    $("#nq").addEventListener("input", debounce(function(){ NST.q = this.value.trim(); renderNGrid(); }, 150));
    $("#nsort").onchange = function(){ NST.sort = this.value; renderNGrid(); };
    renderNGrid(true);
    return "구술자";
  }
  function renderNGrid(first){
    var st = NST;
    function pass(n, skip){
      var s = narStatus(n);
      if (skip !== "cat" && st.cat && n.category !== st.cat) return false;
      if (st.st === "online" && s !== "online") return false;
      if (st.st === "off" && s === "online") return false;
      if (st.q && (n.name + " " + n.headline_position + " " + n.category).indexOf(st.q) < 0 && initialsOf(n.name).indexOf(st.q) !== 0) return false;
      if (skip !== "ini" && st.ini && initial(n.name) !== st.ini) return false;
      return true;
    }
    var list = D.narrators.filter(function(n){ return pass(n); });
    list.sort(function(a, b){
      if (st.sort === "recent") return (narPublished(b) || "0") < (narPublished(a) || "0") ? -1 : 1;
      if (st.sort === "era") return a.assembly_range[0] - b.assembly_range[0];
      return a.name.localeCompare(b.name, "ko");
    });
    $("#ngrid").innerHTML = list.map(narCard).join("");
    $("#nempty").hidden = list.length > 0;
    var on = list.filter(function(n){ return narStatus(n) === "online"; }).length;
    $("#ncount").innerHTML = '<b>' + list.length + '</b>명 · 온라인 공개 ' + on + '명';
    $$("[data-ncat]").forEach(function(b){
      b.setAttribute("aria-pressed", String(st.cat === b.dataset.ncat));
      var c = D.narrators.filter(function(n){ return (!b.dataset.ncat || n.category === b.dataset.ncat) && pass(n, "cat"); }).length;
      $('[data-ccount="' + b.dataset.ncat + '"]').textContent = c;
    });
    $$("[data-nst]").forEach(function(b){ b.setAttribute("aria-pressed", String(st.st === b.dataset.nst)); });
    var has = {}; D.narrators.filter(function(n){ return pass(n, "ini"); }).forEach(function(n){ has[initial(n.name)] = 1; });
    $("#nidx").innerHTML = '<button type="button" data-nini="" aria-pressed="' + (!st.ini) + '" style="width:auto;padding:6px 8px">전체</button>' + CHO_LIST.map(function(c){
      return '<button type="button" data-nini="' + c + '" aria-pressed="' + (st.ini === c) + '"' + (has[c] ? "" : " disabled") + '>' + c + '</button>'; }).join("");
    $$("[data-nini]").forEach(function(b){ b.onclick = function(){ NST.ini = b.dataset.nini; renderNGrid(); }; });
    if (!first){
      var qs = ["cat", "st", "q", "ini"].filter(function(k){ return st[k]; }).map(function(k){ return k + "=" + encodeURIComponent(st[k]); });
      if (st.sort !== "name") qs.push("sort=" + st.sort);
      history.replaceState(null, "", "#/narrators" + (qs.length ? "?" + qs.join("&") : ""));
    }
  }
  function initialsOf(s){
    var o = "";
    for (var i = 0; i < s.length; i++){ var c = s.charCodeAt(i) - 0xAC00; o += (c >= 0 && c <= 11171) ? (CHO_FOLD[CHO[Math.floor(c / 588)]] || CHO[Math.floor(c / 588)]) : s[i]; }
    return o;
  }

  /* ============================================================ OH-03 구술자 상세 */
  function viewNarrator(id, q){
    var n = X.nar[id];
    if (!n){ main.innerHTML = '<div class="wrap"><p class="empty">구술자를 찾을 수 없습니다.</p></div>'; return ""; }
    var ss = X.sesByNar[id] || [];
    var segs = narSegs(n), status = narStatus(n);
    var total = ss.reduce(function(a, s){ return a + sec(s.duration); }, 0);
    var projects = ss.map(function(s){ return s.project_name; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
    var ivs = ss.map(function(s){ return s.interviewer; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
    var levelsUsed = segs.map(function(s){ return s.access_level; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
    var withVideo = segs.filter(hasVideo);
    var band = [sceneSVG(n)].concat(withVideo.length >= 2 ? withVideo.slice(1, 3).map(function(s){ return '<img src="' + thumb(s) + '" alt="">'; }) : [sceneSVG(n, 1), sceneSVG(n, 2)]);

    var ents = {};
    segs.forEach(function(s){ (X.bySeg[s.id] || []).forEach(function(m){
      var k = m.entity_type + "|" + m.entity_id; if (m.entity_id === n.person_id) return; ents[k] = (ents[k] || 0) + 1; }); });
    var entKeys = Object.keys(ents).sort(function(a, b){ return ents[b] - ents[a]; });
    var others = (X.byEnt["PERSON|" + n.person_id] || []).filter(function(m){ return sesOf(X.seg[m.segment_id]).narrator_id !== id; });

    var rel = n.related, relCards = [];
    if (rel.donated_collection) relCards.push(["국회의원 컬렉션", rel.donated_collection]);
    if (rel.series_book) relCards.push(["구술총서", rel.series_book]);
    rel.curations.forEach(function(c){ relCards.push(["큐레이션", c]); });
    rel.records.forEach(function(r){ relCards.push([r.type, r]); });

    var statusBox = status === "online" ? "" :
      '<div class="guide" style="margin-top:34px"><b>' + (status === "processing" ? "구술 정리 중" : "방문 열람 구술") + '</b><p style="margin-top:6px;font-size:14px;color:var(--ink-2)">' +
      (status === "processing" ? "채록을 마쳤으며 세그먼트 분할과 녹취문 검수를 진행하고 있습니다. 정리가 끝나면 온라인으로 공개합니다. 채록 정보와 회차별 요약은 아래에서 볼 수 있습니다."
        : "구술자의 요청에 따라 영상과 녹취문 전체를 국회기록원 열람실에서만 제공합니다. 온라인에는 회차별 요약만 게시합니다.") + '</p>' +
      (status === "onsite" ? '<ol style="margin-top:10px">' + D.site.onsite_guide.map(function(g){ return "<li>" + esc(g) + "</li>"; }).join("") + '</ol>' : '') + '</div>';

    main.innerHTML =
      '<section class="dhero"><div class="band' + (status === "online" ? "" : " gray") + '" aria-hidden="true">' + band.map(function(b){ return "<div>" + b + "</div>"; }).join("") + '</div>' +
      '<div class="wrap"><p class="cap">' + esc(n.photo.caption) + ' · 활동 사진이 들어갈 자리</p>' + crumb([["구술자", "#/narrators"], [n.name]]) +
      '<div class="top"><p class="kicker">구술자 · ' + esc(n.category) + (n.is_sample ? ' · 표본(가상 인물)' : '') + '</p>' +
      '<h1>' + esc(n.name) + (n.name_hanja ? '<small>' + esc(n.name_hanja) + '</small>' : '') + '</h1>' +
      '<p class="oneline">' + esc(n.headline_position) + ' ' + (n.access_level ? lvl(n.access_level) : '<span class="lvl onsite">' + esc(D.site.narrator_status[status]) + '</span>') + '</p>' +
      '<dl class="rec"><div><dt>채록 사업</dt><dd>' + projects.map(esc).join("<br>") + '</dd></div>' +
        '<div><dt>채록</dt><dd>' + ss.map(function(s){ return "제" + s.seq + "차 " + dateK(s.date); }).join("<br>") + '</dd></div>' +
        '<div><dt>분량</dt><dd>' + durK(total) + (segs.length ? ' · 세그먼트 ' + segs.length + '개' : '') + '</dd></div>' +
        '<div><dt>면담자</dt><dd>' + ivs.map(esc).join(", ") + '</dd></div>' +
        '<div><dt>관리번호</dt><dd class="tnum">' + ss.map(function(s){ return esc(s.record_no); }).join("<br>") + '</dd></div>' +
        '<div><dt>재임·경력</dt><dd>' + n.positions.map(function(p){ return esc(p.title) + ' <span class="muted">' + esc(p.period || "") + '</span>'; }).join("<br>") + '</dd></div></dl>' +
      '<div class="share"><button class="btn" data-copy="url">링크 복사</button><button class="btn" data-copy="text" data-text="' + esc(n.name + " 구술 — " + D.site.url_base + "/narrator/" + n.id) + '">공유 문구 복사</button>' +
        '</div>' +
      '</div></div></section>' +

      '<div class="article">' +
        '<div class="bio col">' + n.bio_narrative.map(function(p){ return "<p>" + esc(p) + "</p>"; }).join("") + '</div>' +
        n.representative_quotes.map(function(q){
          var s = X.seg[q.segment_id], t = sec(X.para[q.paragraph_id].p.tc);
          return '<figure class="pull"><p>“' + esc(q.text) + '”</p><cite>— 「<a href="' + segHref(s, t) + '">' + esc(s.title) + '</a>」에서</cite></figure>';
        }).join("") + statusBox +

        '<section class="block" id="index"><h2>구술 목록과 색인</h2><p class="d">채록 회차별로 주제 세그먼트를 나누었습니다. 항목을 펼치면 부분 녹취·요약·키워드·장소·인물·관련 링크가 나오고, 원본 영상의 해당 구간을 바로 재생할 수 있습니다.</p>' +
        (segs.length ? ixSearchBox() : '') +
        ss.map(function(s){
          var list = X.segsBySes[s.id] || [];
          return '<div class="sesh"><h3>제' + s.seq + '차 채록 <span>' + dateK(s.date) + ' · ' + esc(s.place) + ' · 면담 ' + esc(s.interviewer) + ' · ' + durK(sec(s.duration)) + ' · ' + esc(s.media) + ' · ' + esc(s.record_no) + '</span></h3>' +
            (list.length ? '<div class="ixl">' + list.map(function(g){ return ixItem(g); }).join("") + '</div>'
              : '<p class="sesum"><span class="lvl onsite">' + esc(D.site.narrator_status[sesStatus(s)]) + '</span> ' + esc(s.summary) + '</p>') + '</div>';
        }).join("") + '</section>' +

        (entKeys.length ? '<section class="block"><h2>구술 속 장소와 인물</h2><p class="d">이 구술에서 언급된 지명·인명입니다. 누르면 사전 카드와 다른 구술자의 관련 대목을 볼 수 있습니다.</p>' +
          '<div class="ents-list" style="margin-top:16px">' + entKeys.map(function(k){
            var a = k.split("|"), e = entity(a[0], a[1]);
            return entButton(k, e.name + (a[0] === "PERSON" && X.nameCount[e.name] > 1 ? "(" + e.disambiguation + ")" : "") + " · " + ents[k], a[0] === "PLACE" ? "place" : "person");
          }).join("") + '</div></section>' : "") +

        (others.length ? '<section class="block"><h2>다른 구술 속의 ' + esc(n.name) + '</h2><p class="d">다른 구술자가 ' + esc(eul(n.name)) + ' 언급한 대목입니다. 인명 사전의 동일인 연결로 모았습니다.</p>' +
          '<div class="pair-cols" style="margin-top:18px">' + groupBySeg(others).map(function(g){
            return segCard(g.seg, {t:firstMentionT(g.ms), snip:sentenceOf(g.ms[0]), noThumb:true});
          }).join("") + '</div></section>' : "") +

        (relCards.length ? '<section class="block"><h2>관련 자료</h2><div class="rel">' + relCards.map(function(r){
          var body = '<div class="ty">' + esc(r[0]) + '</div><b>' + esc(r[1].title) + '</b><p>' + esc(r[1].note || "") + '</p>';
          return r[1].href ? '<a class="rlink" href="' + r[1].href + '">' + body + '<span class="go">바로 가기 →</span></a>' : '<div>' + body + '</div>';
        }).join("") + '</div></section>' : "") +

        '<section class="block"><h2>공개 안내</h2>' +
          (n.access_level ? '<p class="d">' + esc(D.site.access_levels[n.access_level].desc) + '</p>' : '') +
          (levelsUsed.length ? '<ul style="margin-top:14px;display:flex;flex-direction:column;gap:8px">' + levelsUsed.map(function(l){
            var c = segs.filter(function(s){ return s.access_level === l; }).length;
            return '<li>' + lvl(l) + ' <span class="muted" style="font-size:13px">세그먼트 ' + c + '개 — ' + esc(D.site.access_levels[l].desc) + '</span></li>';
          }).join("") + '</ul>' : '') +
          (levelsUsed.indexOf("onsite") > -1 || levelsUsed.indexOf("transcript_only") > -1 || status === "onsite" ? onsiteGuide() : "") +
          '<p class="disc">' + esc(D.site.disclaimer) + '</p>' +
        '</section>' +
      '</div>';
    bindIxSearch(segs, main, false);
    scrollToParam(q);
    return n.name + " 구술";
  }
  function onsiteGuide(){
    return '<div class="guide"><b>방문 열람 절차</b><ol>' + D.site.onsite_guide.map(function(g){ return "<li>" + esc(g) + "</li>"; }).join("") +
      '</ol><p style="margin-top:12px"><button class="btn" data-toast="열람 신청 화면은 기존 열람신청 절차와 연계됩니다(프로토타입 미구현)">열람 신청</button></p></div>';
  }

  /* ============================================================ OH-04 세그먼트 재생 */
  function viewSegment(id, q){
    var seg = X.seg[id];
    if (!seg){ main.innerHTML = '<div class="wrap"><p class="empty">세그먼트를 찾을 수 없습니다.</p></div>'; return ""; }
    var s = sesOf(seg), n = narOf(seg), sibs = X.segsBySes[s.id], k = sibs.indexOf(seg);
    var prev = sibs[k - 1], next = sibs[k + 1];
    var video = hasVideo(seg), lv = seg.access_level;
    var entsOn = store("ents") !== "0", followOn = store("follow") !== "0", contOn = store("cont") === "1";

    /* 플레이어 또는 대체 영역 */
    var left;
    if (video){
      var m = mediaOf(seg), total = sec(s.duration);
      var bar = sibs.map(function(g){
        var w = (segDur(g) / total * 100).toFixed(3);
        var cls = g === seg ? "cur" : (hasVideo(g) && !m.clip ? "" : "off");
        var lab = pad(g.seq) + " " + g.title + " (" + D.site.access_levels[g.access_level].label + ")";
        return (cls === "" ? '<a href="' + segHref(g) + '" style="flex:' + w + ' 0 0" title="' + esc(lab) + '" aria-label="' + esc(lab) + '"></a>'
          : '<span class="b ' + cls + '" style="flex:' + w + ' 0 0" title="' + esc(lab) + '"></span>');
      }).join("");
      var marks = (X.bySeg[seg.id] || []).map(function(mm){
        return '<span class="mk" style="left:' + (sec(mm.tc) / total * 100).toFixed(3) + '%"></span>';
      }).join("");
      left = '<div class="player" id="player"><div class="vbox"><video id="vid" controls playsinline preload="metadata" poster="' + esc(m.poster) + '" aria-label="' + esc(n.name + " 구술 영상 — " + seg.title) + '">' +
          '<source src="' + esc(m.src) + '" type="video/mp4">' +
          (m.vtt ? '<track kind="captions" srclang="ko" label="한국어 자막" src="' + esc(m.vtt) + '" default>' : '') + '</video>' +
          '<div class="vend" id="vend" hidden><p>이 세그먼트의 끝입니다.</p><div class="row">' +
            '<button class="btn" data-seek="' + segStart(seg) + '">처음부터 다시</button>' +
            (next && !m.clip && hasVideo(next) ? '<a class="btn" href="' + segHref(next) + '?autoplay=1">다음: ' + esc(next.title.split(" — ")[0]) + '</a>' : '') +
          '</div></div></div>' +
        '<div class="timeline"><div class="lb"><span>' + (m.clip ? '하이라이트 클립 · 원본 ' + durK(total) + ' 중 공개 구간' : '제' + s.seq + '차 원본 ' + durK(total) + ' 중 ' + clock(segStart(seg)) + '–' + clock(segEnd(seg)) + ' 구간') + '</span><span id="phpos" class="tnum">' + clock(segStart(seg)) + '</span></div>' +
          '<div class="tl-bar" aria-hidden="' + (m.clip ? "true" : "false") + '">' + bar + marks + '<span class="ph" id="ph"></span></div></div>' +
        '<div class="pctl">' + (m.clip ? '<span class="note">구술자와 협의한 하이라이트 구간만 별도 클립으로 공개합니다(설계 원칙 7의 예외).</span>'
          : '<label><input type="checkbox" id="cont"' + (contOn ? " checked" : "") + '> 다음 세그먼트로 이어 재생</label><span class="note">세그먼트는 원본을 자르지 않은 타임코드 구간입니다</span>') + '</div></div>';
    } else if (lv === "transcript_only"){
      left = '<div class="noplay"><img src="' + thumb(seg) + '" alt=""><div class="msg"><b>영상은 방문 열람으로 제공합니다</b><p>' + esc(D.site.access_levels[lv].desc) + '</p></div></div>';
    } else {
      left = '<div class="noplay"><img src="' + thumb(seg) + '" alt=""><div class="msg"><b>방문 열람 구간</b><p>' + esc(D.site.access_levels.onsite.desc) + '</p></div></div>';
    }

    /* 녹취문 */
    var right;
    if (lv === "onsite"){
      right = '<section class="tx static" aria-labelledby="txh"><div class="txh"><h2 id="txh">녹취문</h2></div><div class="body" style="padding:18px 16px">' +
        '<p>이 구간의 녹취문은 온라인에 게시하지 않습니다.</p>' + onsiteGuide() + '</div></section>';
    } else {
      var hasEn = seg.transcript_sync.some(function(p){ return p.text_en; });
      var lang = hasEn ? (store("lang") || "ko") : "ko";
      right = '<section class="tx' + (video ? "" : " static") + (entsOn ? "" : " ents-off") + '" id="tx" aria-label="녹취문과 색인"><div class="txh">' +
        '<div class="tabs2" role="tablist" aria-label="보기"><button type="button" role="tab" id="tab-tx" aria-selected="true" aria-controls="txbody">녹취문</button>' +
        '<button type="button" role="tab" id="tab-ix" aria-selected="false" aria-controls="ixbody">색인 · 구술 안 검색</button></div>' +
        '<div class="opts"><label><input type="checkbox" id="entsT"' + (entsOn ? " checked" : "") + '> 장소·인물 표시</label>' +
        (video ? '<label><input type="checkbox" id="followT"' + (followOn ? " checked" : "") + '> 재생 위치 따라가기</label>' : '') +
        (hasEn ? '<label>언어 <select id="langT"><option value="ko">한국어</option><option value="en">English</option><option value="both">함께 보기</option></select></label>' : '') +
        '</div><div class="legend"><span class="pl"><i>장소</i>지명 사전</span><span class="ps"><i>인물</i>인명 사전</span></div></div>' +
        '<div class="body" id="txbody" role="tabpanel" aria-labelledby="tab-tx">' + transcriptHTML(seg, n, video, lang) + '</div>' +
        '<div class="body ixbody" id="ixbody" role="tabpanel" aria-labelledby="tab-ix" hidden>' + ixSearchBox() + ixPanel(seg, n) + '</div></section>';
    }

    /* 세그먼트 정보 */
    var ms = X.bySeg[seg.id] || [], ek = [];
    ms.forEach(function(m){ var k2 = m.entity_type + "|" + m.entity_id; if (ek.indexOf(k2) < 0) ek.push(k2); });
    var cross = crossOf(seg);
    var citeText = citation(seg);
    var fullPdf = n.full_transcript_pdf;

    var dls = [];
    if (lv !== "onsite"){
      dls.push(['세그먼트 녹취문(TXT)', '<button class="btn" data-dl="seg">내려받기</button>']);
      dls.push(['제' + s.seq + '차 전체 녹취문(TXT)', '<button class="btn" data-dl="ses">내려받기</button>']);
      dls.push(['색인 포함 전문(PDF)', fullPdf ? '<a class="btn" href="' + esc(fullPdf) + '" download>내려받기</a>' : '<span class="why">표본 1건(홍석진 편)만 제작</span>']);
      if (video) dls.push([mediaOf(seg).clip ? '하이라이트 클립(MP4)' : '제' + s.seq + '차 원본 영상(MP4)', '<a class="btn" href="' + esc(mediaOf(seg).src) + '" download>내려받기</a>']);
    }

    main.innerHTML = '<div class="wrap">' + crumb([[n.name, "#/narrator/" + n.id], ["제" + s.seq + "차 채록", "#/narrator/" + n.id], [pad(seg.seq) + " " + seg.title]]) +
      '<header class="shead"><p class="kicker">' + esc(n.name) + ' · ' + esc(n.headline_position) + ' · 제' + s.seq + '차 채록 · 세그먼트 ' + (k + 1) + '/' + sibs.length + '</p>' +
        '<h1>' + esc(seg.title) + '</h1>' + (seg.title_en ? '<p class="en-t" lang="en">' + esc(seg.title_en) + '</p>' : '') +
        '<div class="meta">' + lvl(lv) + (lv !== "onsite" ? '<span class="tnum">' + clock(segStart(seg)) + '–' + clock(segEnd(seg)) + ' · ' + durK(segDur(seg)) + '</span>' : '<span>' + durK(segDur(seg)) + ' 분량</span>') +
        '<span>면담 ' + esc(s.interviewer) + ' · ' + dateK(s.date) + '</span></div></header>' +
      '<div class="play-grid">' + left + right + '</div>' +

      '<div class="sinfo"><div>' +
        '<h2>세그먼트 요약</h2><p class="sum">' + esc(seg.summary) + '</p>' +
        '<dl class="kv">' +
          (seg.topics.length ? '<dt>주제</dt><dd class="tags">' + seg.topics.map(function(t){ return '<a class="tag" href="#/explore?axis=topic&id=' + t + '">' + esc(topicLabel(t)) + '</a>'; }).join("") + '</dd>' : '') +
          (seg.events.length ? '<dt>사건</dt><dd class="tags">' + seg.events.map(function(t){ return '<a class="tag ev" href="#/explore?axis=event&id=' + t + '">' + esc(topicLabel(t)) + '</a>'; }).join("") + '</dd>' : '') +
          (seg.agenda_items.length ? '<dt>안건</dt><dd class="tags">' + seg.agenda_items.map(function(a){ return '<span class="tag" title="의안정보시스템 연결 예정">' + esc(a) + '</span>'; }).join("") + '</dd>' : '') +
          (seg.period ? '<dt>시기</dt><dd>' + seg.period.from + (seg.period.to !== seg.period.from ? '–' + seg.period.to : '') + '년 <a class="muted" href="#/explore?axis=era">시대 축에서 보기</a></dd>' : '') +
          (ek.length ? '<dt>장소·인물</dt><dd class="ents-list">' + ek.map(function(k2){
            var a = k2.split("|"), e = entity(a[0], a[1]);
            return entButton(k2, e.name, a[0] === "PLACE" ? "place" : "person");
          }).join("") + '</dd>' : '') +
          ((seg.keywords || []).length ? '<dt>키워드</dt><dd class="tags">' + seg.keywords.map(function(k){ return '<a class="tag" href="#/search?q=' + encodeURIComponent(k) + '">' + esc(k) + '</a>'; }).join("") + '</dd>' : '') +
          ((seg.hyperlinks || []).length ? '<dt>관련 링크</dt><dd>' + linksHTML(seg.hyperlinks) + '</dd>' : '') +
        '</dl>' +
        (seg.summary_en ? '<p class="sum en" lang="en">' + esc(seg.summary_en) + '</p>' : '') +
        (cross.length ? '<h2 style="margin-top:34px">다른 구술자의 증언</h2><p class="note" style="margin-bottom:12px">같은 주제·사건을 다른 구술자가 이야기한 대목입니다.</p><div class="pair-cols">' +
          cross.slice(0, 3).map(function(c){ return segCard(c, {noThumb:true, extra: "공통 주제 " + esc(sharedLabel(seg, c))}); }).join("") + '</div>' : '') +
      '</div><div>' +
        '<div class="box"><h2>인용·공유</h2><p class="cite" id="cite">' + esc(citeText) + '</p>' +
          '<div class="share" style="margin-top:12px"><button class="btn" data-copy="cite">인용 표기 복사</button><button class="btn" data-copy="url">세그먼트 링크 복사</button>' +
          (video ? '<button class="btn" data-copy="urlt">현재 재생 위치 링크</button>' : '') + '</div></div>' +
        (dls.length ? '<div class="box"><h2>내려받기</h2><ul class="dl">' + dls.map(function(d){ return '<li><span>' + d[0] + '</span>' + d[1] + '</li>'; }).join("") + '</ul></div>' : '') +
        '<div class="box"><h2>이용 조건</h2><p style="font-size:13.5px">' + esc(seg.license || D.site.license_default) + '</p><p class="note" style="margin-top:6px">' + esc(D.site.license_note) + '</p><p class="disc">' + esc(D.site.disclaimer) + '</p></div>' +
      '</div></div>' +

      '<nav class="prevnext" aria-label="같은 채록의 이전·다음 세그먼트">' +
        (prev ? '<a href="' + segHref(prev) + '"><div class="d">← 이전 세그먼트</div><div class="t">' + esc(prev.title) + '</div></a>' : '<span></span>') +
        (next ? '<a class="nx" href="' + segHref(next) + '"><div class="d">다음 세그먼트 →</div><div class="t">' + esc(next.title) + '</div></a>' : '<span></span>') +
      '</nav><div style="height:90px"></div></div>';

    /* 동작 연결 */
    var tx = $("#tx");
    var et = $("#entsT");
    if (et) et.onchange = function(){ store("ents", et.checked ? "1" : "0"); tx.classList.toggle("ents-off", !et.checked); };
    var ft = $("#followT");
    if (ft) ft.onchange = function(){ store("follow", ft.checked ? "1" : "0"); };
    var ct = $("#cont");
    if (ct) ct.onchange = function(){ store("cont", ct.checked ? "1" : "0"); };
    if (video) mountPlayer(seg, q);
    else if (q.get("t")) markStatic(parseFloat(q.get("t")));
    $$("#tx [role=tab]").forEach(function(b){
      b.onclick = function(){
        var ix = b.id === "tab-ix";
        $("#tab-tx").setAttribute("aria-selected", String(!ix)); $("#tab-ix").setAttribute("aria-selected", String(ix));
        $("#txbody").hidden = ix; $("#ixbody").hidden = !ix;
        if (ix){ var c = $("#ixbody details.cur"); if (c) c.scrollIntoView({block:"nearest"}); }
      };
    });
    var lt = $("#langT");
    if (lt){
      lt.value = store("lang") || "ko";
      lt.onchange = function(){
        store("lang", lt.value);
        $("#txbody").innerHTML = transcriptHTML(seg, n, video, lt.value);
        if (P){ P.paras = $$("#txbody .pa").map(function(el){ return {el:el, t:+el.dataset.t}; }); P.cur = -1; onTime(); }
      };
    }
    if ($("#ixbody")) bindIxSearch(narSegs(n), $("#ixbody"), true);
    return seg.title;
  }

  /* 재생 화면의 색인 패널 — 이 구술자의 모든 회차·세그먼트를 펼쳐 볼 수 있음(OHMS Index) */
  function ixPanel(seg, n){
    return (X.sesByNar[n.id] || []).map(function(s){
      var list = X.segsBySes[s.id] || [];
      if (!list.length) return "";
      return '<p class="ixsh">제' + s.seq + '차 채록 · ' + dateK(s.date) + ' · ' + esc(s.record_no) + '</p><div class="ixl">' +
        list.map(function(g){ return ixItem(g, {here: seg, cur: g === seg, open: g === seg}); }).join("") + '</div>';
    }).join("");
  }
  function transcriptHTML(seg, n, video, lang){
    var seen = {};
    lang = lang || "ko";
    return seg.transcript_sync.map(function(p){
      var t = sec(p.tc), nar = p.speaker === n.name;
      var ms = (X.byPara[p.id] || []).slice().sort(function(a, b){ return a.char_start - b.char_start; });
      var out = "", pos = 0;
      ms.forEach(function(m){
        var k = m.entity_type + "|" + m.entity_id;
        var i = m.char_start == null ? p.text.indexOf(m.surface, pos) : m.char_start;
        if (seen[k] || i < pos) return;   /* 같은 세그먼트 안에서는 첫 언급에만 표시(8.5) */
        seen[k] = 1;
        out += esc(p.text.slice(pos, i)) + '<button type="button" class="ent ' + (m.entity_type === "PLACE" ? "place" : "person") + '" data-ent="' + k + '" aria-haspopup="dialog">' +
          esc(m.surface) + '<span class="sr">, ' + (m.entity_type === "PLACE" ? "지명" : "인명") + ' 사전 보기</span></button>';
        pos = i + m.surface.length;
      });
      out += esc(p.text.slice(pos));
      if (lang === "en" && p.text_en) out = esc(p.text_en);
      return '<div class="pa ' + (nar ? "nar" : "ivw") + '" id="' + p.id + '" data-t="' + t + '">' +
        (video ? '<button type="button" class="tcb" data-seek="' + t + '" aria-label="' + clock(t) + '부터 재생">' + clock(t) + '</button>'
               : '<span class="tcb">' + clock(t) + '</span>') +
        '<span class="who">' + esc(p.speaker) + (nar ? "" : " (면담자)") + '</span><p class="txt"' + (lang === "en" && p.text_en ? ' lang="en"' : '') + '>' + out + '</p>' +
        (lang === "both" && p.text_en ? '<p class="txt en" lang="en">' + esc(p.text_en) + '</p>' : '') + '</div>';
    }).join("");
  }
  function crossOf(seg){
    var me = sesOf(seg).narrator_id;
    return X.order.filter(function(o){
      if (o === seg || sesOf(o).narrator_id === me || o.access_level === "onsite") return false;
      return o.topics.some(function(t){ return seg.topics.indexOf(t) > -1; }) || o.events.some(function(e){ return seg.events.indexOf(e) > -1; });
    }).sort(function(a, b){ return sharedN(seg, b) - sharedN(seg, a); });
  }
  function sharedN(a, b){ return a.topics.concat(a.events).filter(function(t){ return b.topics.indexOf(t) > -1 || b.events.indexOf(t) > -1; }).length; }
  function sharedLabel(a, b){ return a.topics.concat(a.events).filter(function(t){ return b.topics.indexOf(t) > -1 || b.events.indexOf(t) > -1; }).map(topicLabel).join(", "); }
  function citation(seg){
    var s = sesOf(seg), n = narOf(seg);
    return n.name + " 구술, 「" + seg.title + "」, " + s.project_name + " 제" + s.seq + "차 채록(면담: " + s.interviewer + ", " + dateK(s.date) + "), " +
      (seg.access_level === "onsite" ? "" : clockFull(segStart(seg)) + "–" + clockFull(segEnd(seg)) + ", ") + D.site.archive_name + " 소장. " + D.site.url_base + "/segment/" + seg.id;
  }
  function transcriptText(seg){
    var s = sesOf(seg), n = narOf(seg);
    var head = "「" + seg.title + "」\n" + n.name + " 구술 · " + s.project_name + " 제" + s.seq + "차 채록(" + dateK(s.date) + ", 면담 " + s.interviewer + ")\n";
    if (seg.access_level === "onsite") return head + "\n[방문 열람 구간 — 녹취문은 국회기록원 열람실에서 제공]\n";
    return head + clockFull(segStart(seg)) + "–" + clockFull(segEnd(seg)) + " · " + D.site.access_levels[seg.access_level].label + "\n\n" +
      seg.transcript_sync.map(function(p){ return "[" + clockFull(sec(p.tc)) + "] " + p.speaker + ": " + p.text; }).join("\n\n") + "\n";
  }
  function fileFooter(){ return "\n---\n인용: 출처와 타임코드를 밝혀 주십시오. 이용 조건: " + D.site.license_default + "\n※ " + D.site.sample_notice + "\n"; }

  /* ---------- 재생과 녹취문 동기 ---------- */
  function mountPlayer(seg, q){
    var v = $("#vid"), m = mediaOf(seg);
    var start = segStart(seg), end = segEnd(seg) - (m.clip ? 0 : 0.35);
    var t0 = q.get("t") ? Math.min(Math.max(parseFloat(q.get("t")), start), end - 0.5) : start;
    P = { v:v, seg:seg, off:m.offset, start:start, end:end, total:sec(sesOf(seg).duration), clip:m.clip,
      paras:$$("#txbody .pa").map(function(el){ return {el:el, t:+el.dataset.t}; }), cur:-1, userAt:0, prog:false };
    function init(){
      P.prog = true; v.currentTime = Math.max(0, t0 - P.off);
      if (q.get("autoplay") === "1") v.play().catch(function(){});
      onTime();
    }
    if (v.readyState >= 1) init(); else v.addEventListener("loadedmetadata", init, {once:true});
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("play", function(){
      $("#vend").hidden = true;
      var t = now();
      if (t >= P.end - 0.1){ P.prog = true; v.currentTime = P.start - P.off; }
    });
    v.addEventListener("ended", showEnd);
    var body = $("#txbody");
    ["wheel", "touchmove"].forEach(function(ev){
      body.addEventListener(ev, function(){ P && (P.userAt = Date.now()); }, {passive:true});
    });
    window.addEventListener("wheel", userScroll, {passive:true});
  }
  function userScroll(){ if (P) P.userAt = Date.now(); }
  function now(){ return P.v.currentTime + P.off; }
  function stopPlayer(){
    if (P){ try { P.v.pause(); } catch(e){} window.removeEventListener("wheel", userScroll); }
    P = null;
  }
  function onTime(){
    if (!P) return;
    var t = now(), idx = -1;
    for (var i = 0; i < P.paras.length; i++) if (P.paras[i].t <= t + 0.05) idx = i;
    if (t > P.end + 0.5) idx = -1;
    if (idx !== P.cur){
      if (P.cur > -1){ P.paras[P.cur].el.classList.remove("now"); P.paras[P.cur].el.removeAttribute("aria-current"); }
      P.cur = idx;
      if (idx > -1){
        var el = P.paras[idx].el;
        el.classList.add("now"); el.setAttribute("aria-current", "true");
        var ft = $("#followT");
        if ((!ft || ft.checked) && Date.now() - P.userAt > 4000 && !P.v.paused && !$("#txbody").hidden) follow(el);
      }
    }
    var ph = $("#ph"), pp = $("#phpos");
    if (ph) ph.style.left = (Math.min(t, P.total) / P.total * 100).toFixed(3) + "%";
    if (pp) pp.textContent = clock(t);
    if (!P.v.paused && t >= P.end){
      var ct = $("#cont"), sibs = X.segsBySes[P.seg.session_id], nx = sibs[sibs.indexOf(P.seg) + 1];
      if (ct && ct.checked && nx && hasVideo(nx) && !P.clip){ var id = nx.id; stopPlayer(); go("#/segment/" + id + "?autoplay=1&t=" + segStart(nx).toFixed(2)); }
      else { P.v.pause(); showEnd(); }
    }
  }
  /* 원본 영상의 다른 구간으로 옮기면 그 구간의 세그먼트 화면으로 전환함(가상 세그먼트) */
  function onSeeked(){
    if (!P) return;
    if (P.prog){ P.prog = false; onTime(); return; }
    var t = now();
    if (!P.clip && (t < P.start - 0.3 || t > P.end + 0.3)){
      var other = X.segsBySes[P.seg.session_id].filter(function(g){ return t >= segStart(g) && t < segEnd(g); })[0];
      if (other && other !== P.seg && hasVideo(other)){
        var playing = !P.v.paused, id = other.id;
        stopPlayer();
        go("#/segment/" + id + "?t=" + t.toFixed(2) + (playing ? "&autoplay=1" : ""));
        toast("「" + other.title.split(" — ")[0] + "」 구간으로 이동했습니다");
        return;
      }
    }
    onTime();
  }
  function showEnd(){ var e = $("#vend"); if (e) e.hidden = false; }
  function follow(el){
    var body = $("#txbody");
    if (body.scrollHeight > body.clientHeight + 4){
      body.scrollTo({ top: el.offsetTop - body.offsetTop - 60, behavior: "smooth" });
    } else {
      var pl = $("#player"), off = (pl && getComputedStyle(pl).position === "sticky") ? pl.offsetHeight + 60 : 80;
      var r = el.getBoundingClientRect();
      if (r.top < off || r.bottom > window.innerHeight - 20) window.scrollTo({ top: r.top + window.scrollY - off, behavior: "smooth" });
    }
  }
  function seekTo(t){
    if (!P) return;
    P.prog = true;
    P.v.currentTime = Math.max(0, t - P.off);
    P.userAt = 0;
    P.v.play().catch(function(){});
  }
  function markStatic(t){
    var best = null;
    $$("#txbody .pa").forEach(function(el){ if (+el.dataset.t <= t + 0.05) best = el; });
    if (best){ best.classList.add("now"); setTimeout(function(){ best.scrollIntoView({block:"center"}); }, 60); }
  }

  /* ============================================================ 사전 카드(지명·인명) */
  var pop = document.getElementById("pop"), popReturn = null;
  function openEnt(key, anchor){
    var a = key.split("|"), type = a[0], e = entity(a[0], a[1]);
    if (!e) return;
    var here = parseHash(), curSeg = here.parts[0] === "segment" ? here.parts[1] : null;
    var groups = groupBySeg(X.byEnt[key] || []).filter(function(g){ return g.seg.id !== curSeg; });
    var isPlace = type === "PLACE";
    var html = '<div class="hd"><div><div class="ty ' + (isPlace ? "place" : "person") + '">' + (isPlace ? "지명 사전" : "인명 사전") + '</div>' +
      '<h2 id="pop-title">' + esc(e.name) + '</h2>' +
      '<div class="dis">' + esc(isPlace ? precisionLabel(e) + (e.current_name ? " · 현재 " + e.current_name : "") : e.disambiguation) + '</div></div>' +
      '<button class="x" type="button" data-close aria-label="닫기">×</button></div>' +
      '<p class="desc">' + esc(isPlace ? e.description : e.summary) + '</p>';
    if (isPlace && e.lat != null){
      html += '<div class="mini" id="minimap"></div><p class="coord tnum">' + e.lat.toFixed(4) + ', ' + e.lng.toFixed(4) +
        ' · <a href="https://www.google.com/maps/search/?api=1&query=' + e.lat + ',' + e.lng + '" target="_blank" rel="noopener">Google 지도에서 열기↗</a></p>';
    }
    html += '<h3>' + (groups.length ? "이 " + (isPlace ? "장소" : "이름") + "이 나오는 다른 세그먼트 " + groups.length + "건" : "다른 세그먼트에는 나오지 않습니다") + '</h3><ul>' +
      groups.map(function(g){
        var n = narOf(g.seg);
        return '<li><a href="' + segHref(g.seg, firstMentionT(g.ms)) + '">' + esc(g.seg.title) + '<span>' + esc(n.name) + ' 구술 · ' + g.ms.length + '회 언급 · ' + clock(firstMentionT(g.ms)) + '</span></a></li>';
      }).join("") + '</ul><div class="acts">' +
      (isPlace ? '<a class="btn" href="#/map?place=' + e.place_id + '">지도에서 보기</a>' : '<a class="btn" href="#/person/' + e.person_id + '">인명 사전에서 보기</a>') +
      (!isPlace && e.links && e.links.narrator_id ? '<a class="btn" href="#/narrator/' + e.links.narrator_id + '">구술자 페이지</a>' : '') + '</div>';
    pop.innerHTML = html;
    pop.hidden = false;
    popReturn = anchor;
    if (window.innerWidth >= 768 && anchor){
      var r = anchor.getBoundingClientRect(), w = 380, h = pop.offsetHeight;
      var left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
      var top = r.bottom + 8;
      if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 8);
      pop.style.left = left + "px"; pop.style.top = top + "px";
    } else { pop.style.left = ""; pop.style.top = ""; }
    $("[data-close]", pop).focus();
    if (isPlace && e.lat != null) mapsReady().then(function(){ miniMap(e); }, function(){
      var mm = $("#minimap"); if (mm) mm.remove();
    });
  }
  function closePop(silent){
    if (pop.hidden) return;
    pop.hidden = true; pop.innerHTML = "";
    if (!silent && popReturn && document.contains(popReturn)) popReturn.focus();
    popReturn = null;
  }
  function precisionLabel(p){
    return ({POINT:"지점", CITY:"시·군 중심", PROVINCE:"시·도 중심", UNRESOLVED:"위치 미상"})[p.precision] +
      (p.period && (p.period.from || p.period.to) ? " · " + (p.period.from || "") + "–" + (p.period.to || "") : "");
  }

  /* ============================================================ Google 지도 */
  var mapsP = null;
  function mapsReady(){
    if (!CFG.googleMapsApiKey) return Promise.reject(new Error("no key"));
    if (mapsP) return mapsP;
    mapsP = new Promise(function(res, rej){
      window.__ohMaps = function(){ res(); };
      /* 키 오류(API 미사용 설정·결제 미연결·리퍼러 불일치 등)이면 Google 오류 화면 대신 간이 좌표도로 되돌림 */
      window.gm_authFailure = function(){
        mapsP = Promise.reject(new Error("auth")); mapsP.catch(function(){});
        CFG.googleMapsApiKey = ""; CFG.mapsAuthError = true;
        toast("Google 지도 API 키 오류 — 간이 좌표도로 표시합니다");
        if (MAPSTATE && $("#mapbox")){ MAPSTATE.map = null; MAPSTATE.markers = {}; drawInsets(); }
        var mm = $("#minimap"); if (mm) mm.remove();
        rej(new Error("auth"));
      };
      var s = document.createElement("script");
      /* 국내 기준 표기(동해·독도 등)를 위해 언어·지역을 ko·KR로 지정함(노션 8.3) */
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CFG.googleMapsApiKey) +
        "&language=ko&region=KR&v=weekly&libraries=marker&loading=async&callback=__ohMaps";
      s.async = true; s.onerror = function(){ rej(new Error("load")); };
      document.head.appendChild(s);
    });
    return mapsP;
  }
  function miniMap(p){
    var el = $("#minimap"); if (!el) return;
    var map = new google.maps.Map(el, { center:{lat:p.lat, lng:p.lng}, zoom: zoomFor(p), mapId: CFG.googleMapId || "DEMO_MAP_ID",
      disableDefaultUI:true, gestureHandling:"cooperative" });
    new google.maps.marker.AdvancedMarkerElement({ map:map, position:{lat:p.lat, lng:p.lng}, title:p.name });
  }
  function zoomFor(p){ return p.precision === "POINT" ? 15 : p.precision === "CITY" ? 11 : 8; }

  /* ============================================================ OH-05 주제로 보는 구술 */
  /* 「주제로 보기」 안의 보기 방식 탭. 장소·인물·검색은 상단 구술기록 메뉴에만 둠(메뉴 중복 방지) */
  function axesNav(cur){
    return '<nav class="axes" aria-label="보기 방식">' + [["topic","주제별"],["event","사건별"],["era","시대별"]].map(function(a){
      return '<a href="#/explore?axis=' + a[0] + '"' + (cur === a[0] ? ' aria-current="true"' : '') + '>' + a[1] + '</a>';
    }).join("") + '</nav>';
  }
  function lanesOf(segs, snipFn){
    var by = {}, order = [];
    segs.forEach(function(s){ var id = sesOf(s).narrator_id; if (!by[id]){ by[id] = []; order.push(id); } by[id].push(s); });
    return '<div class="lanes">' + order.map(function(id){
      var n = X.nar[id];
      return '<div class="lane"><h3><a href="#/narrator/' + id + '">' + esc(n.name) + '</a><span>' + esc(n.headline_position) + ' · ' + by[id].length + '건</span></h3>' +
        by[id].map(function(s){ return segCard(s, snipFn ? snipFn(s) : {summary:true, noThumb:true}); }).join("") + '</div>';
    }).join("") + '</div>' + (order.length > 1 ? '<p class="crossnote">' + order.length + '명의 구술자가 같은 주제를 증언합니다. 나란히 놓고 서로 다른 기억을 비교해 보십시오.</p>' : '');
  }
  function viewExplore(q){
    var axis = q.get("axis") || "topic", id = q.get("id");
    if (axis === "search" || q.get("q")) return viewSearch(q);   /* 예전 주소 호환 */
    var head = '<section class="phead"><div class="art" aria-hidden="true">' + abstractSVG(515, 2) + '</div><div class="wrap"><p class="kicker">구술기록</p><h1>주제로 보는 구술</h1>' +
      '<p class="lede">주제·사건·시대 축으로 구술을 엽니다. 결과는 인터뷰가 아니라 세그먼트 단위로 돌아오며, 여러 구술자의 같은 사건에 대한 증언이 나란히 놓입니다.</p>' + axesNav(axis) + '</div></section>';
    var body = "";
    var visible = D.segments.filter(function(s){ return s.access_level !== "onsite"; });

    if (axis === "topic" || axis === "event"){
      var vocab = axis === "topic" ? D.topics.topics : D.topics.events;
      var count = {};
      visible.forEach(function(s){ (axis === "topic" ? s.topics : s.events).forEach(function(t){ count[t] = (count[t] || 0) + 1; }); });
      /* 상위 주제는 하위 주제 세그먼트를 합쳐 셈 */
      function segsFor(tid){
        var ids = [tid].concat((X.topic[tid] && X.topic[tid].narrower) || []);
        return X.order.filter(function(s){ return s.access_level !== "onsite" && (axis === "topic" ? s.topics : s.events).some(function(t){ return ids.indexOf(t) > -1; }); });
      }
      var tree;
      if (axis === "topic"){
        tree = vocab.filter(function(t){ return !t.broader; }).map(function(r){
          return '<h2>' + esc(r.label) + '</h2>' + ['<a href="#/explore?axis=topic&id=' + r.id + '"' + (id === r.id ? ' aria-current="true"' : '') + '>전체<small>' + segsFor(r.id).length + '</small></a>']
            .concat(r.narrower.map(function(c){
              var t = X.topic[c];
              return '<a href="#/explore?axis=topic&id=' + c + '"' + (id === c ? ' aria-current="true"' : '') + (count[c] ? '' : ' class="zero"') + '>' + esc(t.label) + '<small>' + (count[c] || 0) + '</small></a>';
            })).join("");
        }).join("");
      } else {
        tree = '<h2>사건</h2>' + vocab.map(function(e){
          return '<a href="#/explore?axis=event&id=' + e.id + '"' + (id === e.id ? ' aria-current="true"' : '') + '>' + esc(e.label) + '<small>' + (count[e.id] || 0) + '</small></a>';
        }).join("");
      }
      var right;
      if (id && (X.topic[id] || X.event[id])){
        var t = X.topic[id] || X.event[id];
        var segs = axis === "topic" ? segsFor(id) : X.order.filter(function(s){ return s.access_level !== "onsite" && s.events.indexOf(id) > -1; });
        right = '<div class="xhead"><p class="kicker">' + (axis === "topic" ? "주제" : "사건") + (t.broader ? ' · <a href="#/explore?axis=topic&id=' + t.broader + '">' + esc(topicLabel(t.broader)) + '</a>' : '') + '</p>' +
          '<h2>' + esc(t.label) + '</h2><p>' + esc(t.definition) + '</p>' +
          (t.related_timeline_entry || t.date ? '<p class="rel-t">국회연표 연결: ' + esc(t.related_timeline_entry || t.date) + '년 항목(연결 예정)</p>' : '') + '</div>' +
          (segs.length ? lanesOf(segs) : '<p class="empty">이 주제를 다룬 세그먼트가 아직 없습니다.</p>');
      } else {
        right = '<div class="xhead"><h2>' + (axis === "topic" ? "주제를 고르십시오" : "사건을 고르십시오") + '</h2><p>통제어휘(주제·사건 어휘집)에 따라 세그먼트를 색인했습니다.</p></div><div class="tgrid">' +
          vocab.filter(function(t){ return count[t.id]; }).map(function(t){
            return '<a href="#/explore?axis=' + axis + '&id=' + t.id + '"><b>' + esc(t.label) + '</b><span>세그먼트 ' + count[t.id] + '개</span></a>';
          }).join("") + '</div>';
      }
      body = '<div class="wrap"><div class="xgrid"><nav class="tree" aria-label="' + (axis === "topic" ? "주제" : "사건") + ' 목록">' + tree + '</nav><div>' + right + '</div></div></div>';
    }
    else if (axis === "era"){
      var asm = q.get("asm") ? +q.get("asm") : null;
      var A = D.assemblies, y0 = A[0].from, y1 = A[A.length - 1].to, span = y1 - y0;
      function pct(y){ return ((y - y0) / span * 100).toFixed(3); }
      var blocks = "", last = y0;
      A.forEach(function(a){
        if (a.from > last) blocks += '<span class="gap" style="flex:' + (a.from - last) + ' 0 0"></span>';
        var c = visible.filter(function(s){ return s.period && s.period.from <= a.to && s.period.to >= a.from; }).length;
        blocks += '<button type="button" data-asm="' + a.no + '" style="flex:' + (a.to - a.from) + ' 0 0" aria-pressed="' + (asm === a.no) + '" title="' + a.label + ' 국회 ' + a.from + '–' + a.to + ' · 세그먼트 ' + c + '개" aria-label="' + a.label + ' 국회, ' + a.from + '년부터 ' + a.to + '년, 세그먼트 ' + c + '개">' +
          ((a.to - a.from) >= 4 ? a.label.replace("제", "").replace("대", "") : "") + '</button>';
        last = a.to;
      });
      var lanes = D.narrators.map(function(n){
        var mine = visible.filter(function(s){ return s.period && sesOf(s).narrator_id === n.id; });
        return '<div class="lane-r"><span class="lb">' + esc(n.name) + '</span>' + mine.map(function(s){
          var w = Math.max(0, (s.period.to - s.period.from) / span * 100);
          return '<a class="dot ' + n.id + '" href="' + segHref(s) + '" style="left:' + pct(s.period.from) + '%;width:calc(' + w.toFixed(3) + '% + 12px)" title="' + esc(s.title + " (" + s.period.from + "–" + s.period.to + ")") + '" aria-label="' + esc(s.title + ", " + s.period.from + "년") + '"></a>';
        }).join("") + '</div>';
      }).join("");
      var years = [1950, 1960, 1975, 1987, 2000, 2012, 2024].map(function(y){ return '<span style="left:' + pct(y) + '%">' + y + '</span>'; }).join("");
      var sel = asm ? A.filter(function(a){ return a.no === asm; })[0] : null;
      var list = X.order.filter(function(s){ return s.period && s.access_level !== "onsite" && (!sel || (s.period.from <= sel.to && s.period.to >= sel.from)); })
        .sort(function(a, b){ return a.period.from - b.period.from; });
      body = '<div class="wrap pagebody"><div class="xhead"><h2>시대로 보기</h2><p>국회 대수 위에 세그먼트가 다루는 시기를 놓았습니다. 대수를 누르면 그 시기의 증언만 봅니다.</p></div>' +
        '<div class="era"><div class="era-in" style="padding-left:0">' + lanes + '<div class="asm" role="group" aria-label="국회 대수">' + blocks + '</div><div class="yrs">' + years + '</div></div></div>' +
        '<div class="era-legend">' + D.narrators.map(function(n){ return '<span class="' + n.id + '"><i></i>' + esc(n.name) + '</span>'; }).join("") + '<span>막대 길이 = 세그먼트가 다루는 시기</span></div>' +
        '<h3 style="margin-top:34px;font-size:15px">' + (sel ? sel.label + ' 국회(' + sel.from + '–' + sel.to + ')의 증언 ' + list.length + '건 <a class="muted" href="#/explore?axis=era" style="font-weight:400;margin-left:8px">전체 보기</a>' : '시기순 전체 ' + list.length + '건') + '</h3>' +
        (list.length ? lanesOf(list) : '<p class="empty">이 시기를 다룬 세그먼트가 없습니다.</p>') + '</div>';
    }

    main.innerHTML = head + body;
    $$("[data-asm]").forEach(function(b){
      b.onclick = function(){ var v = b.dataset.asm; go("#/explore?axis=era" + (b.getAttribute("aria-pressed") === "true" ? "" : "&asm=" + v)); };
    });
    return "주제로 보는 구술";
  }

  /* ============================================================ 구술기록 검색 — 여러 조건으로 채록(구술 건)·세그먼트를 찾음 */
  var SQ = null;
  function uniq(a){ return a.filter(function(v, i){ return a.indexOf(v) === i; }); }
  function byKo(a, b){ return String(a[1]).localeCompare(String(b[1]), "ko"); }
  function entIds(g, type){ return uniq((X.bySeg[g.id] || []).filter(function(m){ return m.entity_type === type; }).map(function(m){ return m.entity_id; })); }
  function facetDefs(){
    function vals(get){ return uniq(D.sessions.map(get)).map(function(v){ return [v, v]; }).sort(byKo); }
    return [
      {k:"nar", g:"구술자", label:"구술자", lv:"ses", opts:D.narrators.map(function(n){ return [n.id, n.name]; }).sort(byKo), get:function(s){ return [s.narrator_id]; }},
      {k:"cat", g:"구술자", label:"구술자 구분", lv:"ses", opts:D.site.categories.map(function(c){ return [c, c]; }), get:function(s){ return [X.nar[s.narrator_id].category]; }},
      {k:"iv", g:"채록 정보", label:"면담자", lv:"ses", opts:vals(function(s){ return s.interviewer; }), get:function(s){ return [s.interviewer]; }},
      {k:"place", g:"채록 정보", label:"구술 장소", lv:"ses", opts:vals(function(s){ return s.place; }), get:function(s){ return [s.place]; }},
      {k:"proj", g:"채록 정보", label:"채록 사업", lv:"ses", opts:vals(function(s){ return s.project_name; }), get:function(s){ return [s.project_name]; }},
      {k:"media", g:"채록 정보", label:"매체", lv:"ses", opts:vals(function(s){ return s.media; }), get:function(s){ return [s.media]; }},
      {k:"st", g:"공개", label:"공개 상태", lv:"ses", opts:[["online", "온라인 공개"], ["onsite", "방문 열람"], ["processing", "정리 중"]], get:function(s){ return [sesStatus(s)]; }},
      {k:"lv", g:"공개", label:"세그먼트 공개 수준", lv:"seg", opts:Object.keys(D.site.access_levels).map(function(k){ return [k, D.site.access_levels[k].label]; }), get:function(g){ return [g.access_level]; }},
      {k:"topic", g:"내용", label:"주제", lv:"seg", opts:D.topics.topics.filter(function(t){ return t.broader; }).map(function(t){ return [t.id, t.label]; }), get:function(g){ return g.topics; }},
      {k:"event", g:"내용", label:"사건", lv:"seg", opts:D.topics.events.map(function(t){ return [t.id, t.label]; }), get:function(g){ return g.events; }},
      {k:"person", g:"내용", label:"언급 인물", lv:"seg", opts:D.persons.filter(function(p){ return p.is_public_figure && X.byEnt["PERSON|" + p.person_id]; }).map(function(p){ return [p.person_id, p.name + (X.nameCount[p.name] > 1 ? "(" + p.disambiguation + ")" : "")]; }).sort(byKo), get:function(g){ return entIds(g, "PERSON"); }},
      {k:"pl", g:"내용", label:"언급 장소", lv:"seg", opts:D.places.filter(function(p){ return p.is_public && X.byEnt["PLACE|" + p.place_id]; }).map(function(p){ return [p.place_id, p.name]; }).sort(byKo), get:function(g){ return entIds(g, "PLACE"); }}
    ];
  }
  function sMatch(st, skip){
    var F = SQ.F, term = st.q.toLowerCase(), asm = st.asm && skip !== "asm" ? D.assemblies.filter(function(a){ return String(a.no) === st.asm; })[0] : null;
    var sesF = F.filter(function(f){ return f.lv === "ses" && f.k !== skip && st[f.k].length; });
    var segF = F.filter(function(f){ return f.lv === "seg" && f.k !== skip && st[f.k].length; });
    var segOn = segF.length > 0 || !!asm;
    function hasAny(vals, sel){ return vals.some(function(v){ return sel.indexOf(v) > -1; }); }
    function okSeg(g){
      for (var i = 0; i < segF.length; i++) if (!hasAny(segF[i].get(g), st[segF[i].k])) return false;
      if (asm && (!g.period || g.period.to < asm.from || g.period.from > asm.to)) return false;
      return true;
    }
    function hits(g){
      var r = {score:0, hits:[], inSum:false, inKw:false};
      if (!term) return r;
      if (g.title.toLowerCase().indexOf(term) > -1) r.score += 3;
      if (g.summary.toLowerCase().indexOf(term) > -1){ r.score += 1; r.inSum = true; }
      if ((g.keywords || []).some(function(k){ return k.toLowerCase().indexOf(term) > -1; })){ r.score += 2; r.inKw = true; }
      if (g.access_level !== "onsite") g.transcript_sync.forEach(function(p){
        var i = p.text.toLowerCase().indexOf(term); if (i < 0) return;
        var a = Math.max(p.text.lastIndexOf(". ", i), p.text.lastIndexOf("? ", i)); a = a < 0 ? 0 : a + 2;
        var b = p.text.slice(i).search(/[.?!](\s|$)/); b = b < 0 ? p.text.length : i + b + 1;
        r.hits.push({t:sec(p.tc), html:hi(p.text.slice(a, b), st.q)}); r.score += 2;
      });
      return r;
    }
    var ses = [], segs = [];
    D.sessions.forEach(function(s){
      for (var i = 0; i < sesF.length; i++) if (!hasAny(sesF[i].get(s), st[sesF[i].k])) return;
      if (skip !== "date"){ if (st.df && s.date < st.df) return; if (st.dt && s.date > st.dt) return; }
      var n = X.nar[s.narrator_id];
      var meta = !term || [n.name, n.headline_position, n.category, s.record_no, s.interviewer, s.place, s.project_name, s.summary, s.media].join(" ").toLowerCase().indexOf(term) > -1;
      var list = (X.segsBySes[s.id] || []).filter(okSeg), inSegs = [];
      list.forEach(function(g){ var h = hits(g); if (!term || meta || h.score) inSegs.push({g:g, h:h}); });
      inSegs.forEach(function(m){ segs.push({seg:m.g, h:m.h, date:s.date, score:m.h.score + (term && meta ? 1 : 0)}); });
      var ok = segOn ? inSegs.length > 0 : (meta || inSegs.length > 0);
      if (ok) ses.push({s:s, segs:inSegs.map(function(m){ return m.g; }), matched:term ? inSegs.filter(function(m){ return m.h.score; }) : [], score:(term && meta ? 2 : 0) + inSegs.reduce(function(a, m){ return a + m.h.score; }, 0)});
    });
    return {ses:ses, segs:segs};
  }
  function viewSearch(q){
    var F = facetDefs();
    var st = {q:(q.get("q") || "").trim(), mode:q.get("mode") || "ses", sort:q.get("sort") || "rel", df:q.get("df") || "", dt:q.get("dt") || "", asm:q.get("asm") || ""};
    F.forEach(function(f){ st[f.k] = q.get(f.k) ? q.get(f.k).split(",") : []; });
    SQ = {F:F, st:st};
    var tq = $("#topq"); if (tq) tq.value = st.q;
    var groups = ["구술자", "채록 정보", "공개", "내용"];
    function facetHTML(f){
      return '<div class="fac"><p class="fl" id="fl-' + f.k + '">' + esc(f.label) + '</p><div role="group" aria-labelledby="fl-' + f.k + '"' + (f.opts.length > 6 ? ' class="scrollf"' : '') + '>' + f.opts.map(function(o){
        return '<label class="opt"><input type="checkbox" data-f="' + f.k + '" value="' + esc(o[0]) + '"' + (st[f.k].indexOf(o[0]) > -1 ? " checked" : "") + '><span>' + esc(o[1]) + '</span><small data-cnt="' + f.k + '|' + esc(o[0]) + '"></small></label>';
      }).join("") + '</div></div>';
    }
    main.innerHTML = '<section class="phead"><div class="art" aria-hidden="true">' + abstractSVG(2468, 3) + '</div><div class="wrap"><p class="kicker">구술기록</p><h1>구술기록 검색</h1>' +
      '<p class="lede">구술자·면담자·구술 장소·면담 일자 등 채록 정보와, 주제·사건·언급 인물·장소 등 내용 색인을 함께 조건으로 걸어 찾습니다. 검색어는 채록 정보와 세그먼트 제목·요약·키워드·녹취문 전문에 적용됩니다.</p>' +
      '<form class="sform" id="sform" role="search"><label class="sr" for="sq">검색어</label><input id="sq" type="search" value="' + esc(st.q) + '" placeholder="예: 회의록, 정다온, 춘천, OH-2024"><button class="btn primary" type="submit">검색</button></form>' +
      '<div class="modes" role="group" aria-label="결과 단위">' + [["ses", "채록(구술 건) 단위"], ["seg", "세그먼트(대목) 단위"]].map(function(m){
        return '<button type="button" data-mode="' + m[0] + '" aria-pressed="' + (st.mode === m[0]) + '">' + m[1] + '</button>'; }).join("") + '</div></div></section>' +
      '<div class="wrap"><div class="sgrid"><aside class="sfacets" aria-label="상세 조건"><details class="sfold" open><summary>상세 조건</summary>' +
        groups.map(function(gname){
          return '<fieldset><legend>' + gname + '</legend>' + F.filter(function(f){ return f.g === gname; }).map(facetHTML).join("") +
            (gname === "채록 정보" ? '<div class="fac"><p class="fl">면담 일자</p><div class="drange"><label class="sr" for="sdf">시작일</label><input type="date" id="sdf" value="' + esc(st.df) + '"><span>~</span><label class="sr" for="sdt">종료일</label><input type="date" id="sdt" value="' + esc(st.dt) + '"></div></div>' : '') +
            (gname === "내용" ? '<div class="fac"><p class="fl"><label for="sasm">다룬 시기(국회 대수)</label></p><select id="sasm" class="sel"><option value="">전체</option>' + D.assemblies.map(function(a){
              return '<option value="' + a.no + '"' + (st.asm === String(a.no) ? " selected" : "") + '>' + a.label + ' 국회(' + a.from + '–' + a.to + ')</option>'; }).join("") + '</select></div>' : '') +
            '</fieldset>';
        }).join("") +
        '<button class="btn" id="sreset" type="button">조건 초기화</button></details></aside>' +
      '<div class="sres"><div class="shead"><p id="scount" aria-live="polite"></p><label class="sr" for="ssort">정렬</label><select id="ssort" class="sel">' +
        [["rel", "관련도순"], ["new", "면담 일자 최신순"], ["old", "면담 일자 오래된순"], ["name", "구술자 가나다순"]].map(function(o){ return '<option value="' + o[0] + '"' + (st.sort === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") +
        '</select></div><div class="chips0" id="schips"></div><div id="sresults"></div></div></div></div>';
    if (window.innerWidth < 1024) $(".sfold").open = false;
    $$("[data-f]").forEach(function(c){ c.onchange = function(){
      var a = st[c.dataset.f], i = a.indexOf(c.value);
      if (c.checked && i < 0) a.push(c.value); if (!c.checked && i > -1) a.splice(i, 1);
      renderSearch(); }; });
    $("#sdf").onchange = function(){ st.df = this.value; renderSearch(); };
    $("#sdt").onchange = function(){ st.dt = this.value; renderSearch(); };
    $("#sasm").onchange = function(){ st.asm = this.value; renderSearch(); };
    $("#ssort").onchange = function(){ st.sort = this.value; renderSearch(); };
    $$("[data-mode]").forEach(function(b){ b.onclick = function(){ st.mode = b.dataset.mode; renderSearch(); }; });
    $("#sform").onsubmit = function(ev){ ev.preventDefault(); st.q = $("#sq").value.trim(); if (tq) tq.value = st.q; renderSearch(); };
    $("#sreset").onclick = function(){ F.forEach(function(f){ st[f.k] = []; }); st.df = st.dt = st.asm = ""; $$("[data-f]").forEach(function(c){ c.checked = false; }); $("#sdf").value = $("#sdt").value = $("#sasm").value = ""; renderSearch(); };
    renderSearch(true);
    return "구술기록 검색";
  }
  function renderSearch(first){
    var st = SQ.st, F = SQ.F, r = sMatch(st, null), unitSes = st.mode !== "seg";
    /* 조건별 건수: 그 조건만 뺀 나머지 조건으로 셈 */
    F.forEach(function(f){
      var rr = sMatch(st, f.k), cnt = {};
      if (unitSes) rr.ses.forEach(function(x){
        var vals = f.lv === "ses" ? f.get(x.s) : uniq([].concat.apply([], x.segs.map(f.get)));
        vals.forEach(function(v){ cnt[v] = (cnt[v] || 0) + 1; });
      });
      else rr.segs.forEach(function(x){ (f.lv === "ses" ? f.get(sesOf(x.seg)) : f.get(x.seg)).forEach(function(v){ cnt[v] = (cnt[v] || 0) + 1; }); });
      f.opts.forEach(function(o){
        var el = $('[data-cnt="' + f.k + '|' + o[0].replace(/"/g, '\\"') + '"]'); if (!el) return;
        el.textContent = cnt[o[0]] || 0;
        el.parentNode.classList.toggle("zero", !cnt[o[0]] && st[f.k].indexOf(o[0]) < 0);
      });
    });
    $$("[data-mode]").forEach(function(b){ b.setAttribute("aria-pressed", String(st.mode === b.dataset.mode)); });
    /* 적용 중인 조건 */
    var chips = [];
    if (st.q) chips.push(["q", "", "검색어: " + st.q]);
    F.forEach(function(f){ st[f.k].forEach(function(v){ var o = f.opts.filter(function(x){ return x[0] === v; })[0]; chips.push([f.k, v, f.label + ": " + (o ? o[1] : v)]); }); });
    if (st.df || st.dt) chips.push(["date", "", "면담 일자: " + (st.df ? dateK(st.df) : "") + " ~ " + (st.dt ? dateK(st.dt) : "")]);
    if (st.asm) chips.push(["asm", "", "다룬 시기: 제" + st.asm + "대"]);
    $("#schips").innerHTML = chips.map(function(c){ return '<button type="button" class="fchip" data-rm="' + esc(c[0] + "|" + c[1]) + '" aria-label="' + esc(c[2]) + ' 조건 해제">' + esc(c[2]) + ' ×</button>'; }).join("");
    $$("[data-rm]").forEach(function(b){ b.onclick = function(){
      var a = b.dataset.rm.split("|"), k = a[0], v = a.slice(1).join("|");
      if (k === "q"){ st.q = ""; $("#sq").value = ""; } else if (k === "date"){ st.df = st.dt = ""; $("#sdf").value = $("#sdt").value = ""; }
      else if (k === "asm"){ st.asm = ""; $("#sasm").value = ""; }
      else { st[k].splice(st[k].indexOf(v), 1); var c = $('[data-f="' + k + '"][value="' + v.replace(/"/g, '\\"') + '"]'); if (c) c.checked = false; }
      renderSearch(); }; });
    /* 결과 */
    function nm(x){ return X.nar[(x.s || sesOf(x.seg)).narrator_id].name; }
    function dt(x){ return (x.s || sesOf(x.seg)).date; }
    var list = unitSes ? r.ses : r.segs;
    list.sort(function(a, b){
      if (st.sort === "new") return dt(a) < dt(b) ? 1 : -1;
      if (st.sort === "old") return dt(a) > dt(b) ? 1 : -1;
      if (st.sort === "name") return nm(a).localeCompare(nm(b), "ko") || (dt(a) > dt(b) ? 1 : -1);
      return (b.score - a.score) || (dt(a) < dt(b) ? 1 : -1);
    });
    $("#scount").innerHTML = unitSes ? '채록 <b>' + r.ses.length + '</b>건 · 해당 세그먼트 ' + r.segs.length + '개' : '세그먼트 <b>' + r.segs.length + '</b>개 · 채록 ' + r.ses.length + '건';
    if (!list.length){ $("#sresults").innerHTML = '<p class="empty">조건에 맞는 구술기록이 없습니다. 조건을 줄여 보십시오.</p>'; }
    else if (unitSes){
      $("#sresults").innerHTML = '<div class="tblwrap"><table class="rtable"><caption class="sr">채록 단위 검색 결과</caption><thead><tr>' +
        ['관리번호', '구술자', '회차', '면담 일자', '면담자', '구술 장소', '채록 사업', '분량·매체', '공개'].map(function(h){ return '<th scope="col">' + h + '</th>'; }).join("") + '</tr></thead><tbody>' +
        list.map(function(x){
          var s = x.s, n = X.nar[s.narrator_id], stt = sesStatus(s);
          return '<tr><td class="tnum">' + esc(s.record_no) + '</td><td><a href="#/narrator/' + n.id + '?to=index">' + hi(n.name, st.q) + '</a><small>' + esc(n.headline_position) + '</small></td>' +
            '<td>제' + s.seq + '차</td><td class="tnum">' + dateK(s.date) + '</td><td>' + hi(s.interviewer, st.q) + '</td><td>' + hi(s.place, st.q) + '</td><td>' + hi(s.project_name, st.q) + '</td>' +
            '<td class="tnum">' + durK(sec(s.duration)) + '<small>' + esc(s.media) + '</small></td><td><span class="lvl ' + (stt === "online" ? "full" : "onsite") + '">' + esc(D.site.narrator_status[stt]) + '</span>' +
            (x.segs.length ? '<small>세그먼트 ' + x.segs.length + '개</small>' : '') + '</td></tr>' +
            (x.matched.length ? '<tr class="sub"><td></td><td colspan="8">' + x.matched.slice(0, 3).map(function(m){
              var h = m.h.hits[0];
              return '<a href="' + segHref(m.g, h ? h.t : null) + '">' + pad(m.g.seq) + ' ' + esc(m.g.title) + '</a>' + (h ? ' <span class="tnum muted">' + clock(h.t) + '</span> <span class="hl1">' + h.html + '</span>' : '');
            }).join("<br>") + (x.matched.length > 3 ? '<br><span class="muted">외 ' + (x.matched.length - 3) + '개</span>' : '') + '</td></tr>' : '');
        }).join("") + '</tbody></table></div><p class="note">구술자 이름을 누르면 구술자 카드(상세)의 구술 목록·색인으로 이동합니다. 정리 중인 채록은 채록 정보만 검색됩니다.</p>';
    } else {
      $("#sresults").innerHTML = '<ul class="res">' + list.map(function(x){
        var g = x.seg, n = narOf(g);
        return '<li><div class="who">' + esc(n.name) + ' · 제' + sesOf(g).seq + '차 · ' + dateK(sesOf(g).date) + ' · 면담 ' + esc(sesOf(g).interviewer) + ' · ' + pad(g.seq) + ' ' + lvl(g.access_level, true) + '</div>' +
          '<h3><a href="' + segHref(g) + '">' + hi(g.title, st.q) + '</a></h3>' +
          (x.h.inSum || !st.q ? '<p class="mq">' + hi(g.summary, st.q) + '</p>' : '') +
          (x.h.inKw ? '<p class="mq">키워드: ' + g.keywords.map(function(k){ return hi(k, st.q); }).join(", ") + '</p>' : '') +
          x.h.hits.slice(0, 3).map(function(h){ return '<div class="hit"><a href="' + segHref(g, h.t) + '">' + clock(h.t) + '</a><span>' + h.html + '</span></div>'; }).join("") + '</li>';
      }).join("") + '</ul>';
    }
    if (!first){
      var qs = [];
      if (st.q) qs.push("q=" + encodeURIComponent(st.q));
      if (st.mode !== "ses") qs.push("mode=" + st.mode);
      if (st.sort !== "rel") qs.push("sort=" + st.sort);
      ["df", "dt", "asm"].forEach(function(k){ if (st[k]) qs.push(k + "=" + encodeURIComponent(st[k])); });
      F.forEach(function(f){ if (st[f.k].length) qs.push(f.k + "=" + encodeURIComponent(st[f.k].join(","))); });
      history.replaceState(null, "", "#/search" + (qs.length ? "?" + qs.join("&") : ""));
    }
  }
  function hi(text, term){
    if (!term) return esc(text);
    var i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + term.length)) + "</mark>" + hi(text.slice(i + term.length), term);
  }
  /* ============================================================ OH-07 지도로 보는 구술 */
  var MAPSTATE = null;
  function viewMap(q){
    var st = { place: q.get("place") || "", nar: q.get("nar") || "", topic: q.get("topic") || "" };
    var topics = D.topics.topics.filter(function(t){ return t.broader; });
    main.innerHTML = '<section class="phead"><div class="art" aria-hidden="true">' + abstractSVG(3131, 5) + '</div><div class="wrap"><p class="kicker">구술기록</p><h1>지도로 보는 구술</h1>' +
      '<p class="lede">구술에 등장한 장소를 지명 사전으로 정리해 지도에 두었습니다. 핀이나 오른쪽 장소 목록을 누르면 그 장소를 언급한 대목이 나오고, 대목을 누르면 그 위치부터 재생합니다.</p></div></section>' +
      '<div class="wrap"><div class="mgrid"><div class="mapbox" id="mapbox"><div id="gmap"></div></div>' +
      '<aside class="mside" aria-label="지명 목록"><div class="filters">' +
        '<label class="sr" for="fnar">구술자</label><select id="fnar"><option value="">구술자 전체</option>' + D.narrators.map(function(n){ return '<option value="' + n.id + '"' + (st.nar === n.id ? " selected" : "") + '>' + esc(n.name) + '</option>'; }).join("") + '</select>' +
        '<label class="sr" for="ftop">주제</label><select id="ftop"><option value="">주제 전체</option>' + topics.map(function(t){ return '<option value="' + t.id + '"' + (st.topic === t.id ? " selected" : "") + '>' + esc(t.label) + '</option>'; }).join("") + '</select>' +
      '</div><div id="plist" class="plist"></div><div id="pdetail"></div>' +
      '<p class="note" style="margin-top:18px">핀 모양은 좌표 정밀도를 나타냅니다: 채운 원 = 지점, 굵은 테두리 = 시·군 중심, 점선 = 시·도 중심. 사적 장소(개인 자택 등)는 지도에 표시하지 않습니다.</p></aside></div></div>';
    MAPSTATE = { st: st, markers: {}, map: null };
    $("#fnar").onchange = function(){ st.nar = this.value; mapUpdate(true); };
    $("#ftop").onchange = function(){ st.topic = this.value; mapUpdate(true); };
    mapUpdate(false);
    mapsReady().then(initGMap, function(){ drawInsets(); });
    return "지도로 보는 구술";
  }
  function mapMentions(){
    var st = MAPSTATE.st;
    return X.pub.filter(function(m){
      if (m.entity_type !== "PLACE") return false;
      var s = X.seg[m.segment_id];
      if (st.nar && sesOf(s).narrator_id !== st.nar) return false;
      if (st.topic && s.topics.indexOf(st.topic) < 0) return false;
      return true;
    });
  }
  function mapPlaces(){
    var ms = mapMentions(), c = {};
    ms.forEach(function(m){ c[m.entity_id] = (c[m.entity_id] || 0) + 1; });
    return D.places.filter(function(p){ return p.is_public && p.lat != null; }).map(function(p){ return {p:p, n:c[p.place_id] || 0}; });
  }
  function mapUpdate(pushState){
    var st = MAPSTATE.st, pl = mapPlaces();
    var qs = ["place", "nar", "topic"].filter(function(k){ return st[k]; }).map(function(k){ return k + "=" + encodeURIComponent(st[k]); }).join("&");
    if (pushState) history.replaceState(null, "", "#/map" + (qs ? "?" + qs : ""));
    var regions = [];
    pl.forEach(function(x){ if (regions.indexOf(x.p.region) < 0) regions.push(x.p.region); });
    $("#plist").innerHTML = regions.map(function(r){
      return '<h3>' + esc(r) + '</h3><ul>' + pl.filter(function(x){ return x.p.region === r; }).map(function(x){
        return '<li><button type="button" data-place="' + x.p.place_id + '" aria-pressed="' + (st.place === x.p.place_id) + '"' + (x.n ? "" : ' style="opacity:.45"') + '>' +
          '<span>' + esc(x.p.name) + ' <span class="prec">' + precisionLabel(x.p).split(" · ")[0] + '</span></span><small>언급 ' + x.n + '회</small></button></li>';
      }).join("") + '</ul>';
    }).join("");
    var sel = X.place[st.place];
    if (sel && sel.is_public){
      var ms = mapMentions().filter(function(m){ return m.entity_id === sel.place_id; });
      var groups = groupBySeg(ms);
      $("#pdetail").innerHTML = '<div class="pdetail" tabindex="-1" id="pdbox"><p class="kicker">지명 사전</p><h2>' + esc(sel.name) + '</h2>' +
        '<div class="dis"><span class="prec">' + esc(precisionLabel(sel)) + '</span>' + (sel.current_name ? '<span>현재 ' + esc(sel.current_name) + '</span>' : '') + '</div>' +
        '<p class="desc">' + esc(sel.description) + '</p>' +
        '<p class="note" style="margin-top:8px">이형 표기: ' + sel.variants.map(esc).join(", ") + ' · <a href="https://www.google.com/maps/search/?api=1&query=' + sel.lat + ',' + sel.lng + '" target="_blank" rel="noopener">Google 지도에서 열기↗</a></p>' +
        '<h3>이 장소를 언급한 대목 ' + groups.length + '건' + (st.nar || st.topic ? ' (필터 적용)' : '') + '</h3><ul>' +
        groups.map(function(g){
          var n = narOf(g.seg);
          return '<li><a href="' + segHref(g.seg, firstMentionT(g.ms)) + '">' + esc(g.seg.title) + '<span>' + esc(n.name) + ' 구술 · ' + g.ms.length + '회 언급 · ' + clock(firstMentionT(g.ms)) + '부터 · ' + D.site.access_levels[g.seg.access_level].label + '</span></a></li>';
        }).join("") + '</ul></div>';
    } else $("#pdetail").innerHTML = '<p class="note" style="margin-top:16px">지도의 핀이나 위 장소 목록을 누르면 그 장소를 언급한 대목이 여기에 나옵니다. 대목을 누르면 재생 화면으로 이동합니다.</p>';
    /* 마커 갱신 */
    if (MAPSTATE.map){
      pl.forEach(function(x){
        var mk = MAPSTATE.markers[x.p.place_id]; if (!mk) return;
        mk.content.className = pinClass(x.p) + (st.place === x.p.place_id ? " sel" : "");
        mk.content.textContent = x.n;
        mk.map = x.n ? MAPSTATE.map : null;
      });
    } else if ($("#insets")) drawInsets();
  }
  function pinClass(p){ return "gpin" + (p.precision === "CITY" ? " city" : p.precision === "PROVINCE" ? " province" : ""); }
  function selectPlace(id, focusMap){
    MAPSTATE.st.place = MAPSTATE.st.place === id && !focusMap ? MAPSTATE.st.place : id;
    mapUpdate(true);
    var p = X.place[id];
    if (MAPSTATE.map && p){ MAPSTATE.map.panTo({lat:p.lat, lng:p.lng}); MAPSTATE.map.setZoom(zoomFor(p)); }
    var box = $("#pdbox"); if (box && window.innerWidth < 1024) box.scrollIntoView({block:"start", behavior:"smooth"});
  }
  function initGMap(){
    if (!MAPSTATE || !$("#gmap")) return;
    var st = MAPSTATE.st, pl = mapPlaces();
    var map = new google.maps.Map($("#gmap"), { center:{lat:37.7, lng:127.4}, zoom:8, mapId: CFG.googleMapId || "DEMO_MAP_ID",
      mapTypeControl:false, streetViewControl:false, fullscreenControl:true });
    MAPSTATE.map = map;
    var b = new google.maps.LatLngBounds();
    pl.forEach(function(x){
      var el = document.createElement("div");
      el.className = pinClass(x.p) + (st.place === x.p.place_id ? " sel" : "");
      el.textContent = x.n;
      var mk = new google.maps.marker.AdvancedMarkerElement({ map: x.n ? map : null, position:{lat:x.p.lat, lng:x.p.lng}, content:el,
        title: x.p.name + " — 언급 " + x.n + "회", gmpClickable:true });
      mk.addEventListener("gmp-click", function(){ selectPlace(x.p.place_id, true); });
      MAPSTATE.markers[x.p.place_id] = mk;
      if (x.p.region !== "해외") b.extend({lat:x.p.lat, lng:x.p.lng});
    });
    var sel = X.place[st.place];
    if (sel && sel.lat != null){ map.setCenter({lat:sel.lat, lng:sel.lng}); map.setZoom(zoomFor(sel)); }
    else map.fitBounds(b, 50);
  }
  /* 지도 API 키가 없을 때: 권역별 간이 좌표도 */
  function drawInsets(){
    var box = $("#mapbox"); if (!box) return;
    var st = MAPSTATE.st, pl = mapPlaces(), regions = [];
    pl.forEach(function(x){ if (regions.indexOf(x.p.region) < 0) regions.push(x.p.region); });
    var html = '<p class="mapnote">' + (CFG.mapsAuthError ? 'Google 지도 키가 이 주소(' + esc(location.host) + ')에서 허용되지 않아 권역별 간이 좌표도로 표시합니다(Google Cloud 콘솔에서 키의 웹사이트 제한에 이 주소를 추가하면 Google 지도로 바뀜)' : 'Google 지도 API 키가 설정되지 않아 권역별 간이 좌표도로 표시합니다(config.js에 키를 넣으면 Google 지도로 바뀜)') + '</p><div class="insets" id="insets">';
    regions.forEach(function(r, ri){
      var ps = pl.filter(function(x){ return x.p.region === r; });
      var la = ps.map(function(x){ return x.p.lat; }), ln = ps.map(function(x){ return x.p.lng; });
      var minA = Math.min.apply(null, la), maxA = Math.max.apply(null, la), minN = Math.min.apply(null, ln), maxN = Math.max.apply(null, ln);
      var sA = Math.max(maxA - minA, 0.02), sN = Math.max(maxN - minN, 0.02);
      /* 첫 권역(핀이 가장 많은 서울)은 넓은 칸으로 그림 — 칸 비율과 viewBox를 맞춰 글자 크기를 일정하게 함 */
      var W = ri === 0 ? 620 : 300, H = ri === 0 ? 250 : 190, pad2 = 34, placed = [];
      function xy(p){ return [pad2 + (p.lng - (minN + maxN) / 2 + sN / 2) / sN * (W - 2 * pad2), H - pad2 - (p.lat - (minA + maxA) / 2 + sA / 2) / sA * (H - 2 * pad2)]; }
      var g = '<line class="grid-l" x1="0" y1="' + H / 2 + '" x2="' + W + '" y2="' + H / 2 + '"/><line class="grid-l" x1="' + W / 2 + '" y1="0" x2="' + W / 2 + '" y2="' + H + '"/>';
      ps.forEach(function(x){
        var c = xy(x.p), rr = x.p.precision === "PROVINCE" ? 13 : x.p.precision === "CITY" ? 9 : 7;
        /* 오른쪽 가장자리에 가까우면 이름을 핀 왼쪽에 둠. 이름끼리 겹치면 아래로 내림 */
        var right = c[0] > W * 0.6, ly = c[1] + 4, lx = right ? c[0] - rr - 5 : c[0] + rr + 5;
        placed.forEach(function(q2){ if (Math.abs(q2[0] - lx) < 90 && Math.abs(q2[1] - ly) < 13) ly = q2[1] + 14; });
        placed.push([lx, ly]);
        var cls = "pinbtn" + (x.p.precision === "CITY" ? " city" : x.p.precision === "PROVINCE" ? " province" : "") + (st.place === x.p.place_id ? " sel" : "");
        g += '<g class="' + cls + '" data-place="' + x.p.place_id + '" tabindex="0" role="button" aria-label="' + esc(x.p.name + ", 언급 " + x.n + "회") + '"' + (x.n ? "" : ' opacity=".35"') + '>' +
          '<circle class="c" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="' + rr + '"/><text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '"' + (right ? ' text-anchor="end"' : '') + '>' + esc(x.p.name) + ' ' + x.n + '</text></g>';
      });
      html += '<div class="inset"><span class="nm">' + esc(r) + '</span><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + g + '</svg></div>';
    });
    box.innerHTML = html + '</div>';
  }

  /* ============================================================ OH-08 인명 사전 */
  var PTYPES = [["", "전체"], ["MEMBER", "국회의원"], ["STAFF", "국회 직원"], ["PRESS", "언론인"]];
  function viewPersons(q){
    var ini = q.get("ini") || "", type = q.get("type") || "";
    var all = D.persons.filter(function(p){ return p.is_public_figure; }).sort(function(a, b){ return a.name.localeCompare(b.name, "ko"); });
    var has = {}; all.forEach(function(p){ has[initial(p.name)] = 1; });
    var list = all.filter(function(p){ return (!ini || initial(p.name) === ini) && (!type || p.type === type); });
    function href(o){ var a = []; var i2 = o.ini != null ? o.ini : ini, t2 = o.type != null ? o.type : type; if (i2) a.push("ini=" + encodeURIComponent(i2)); if (t2) a.push("type=" + t2); return "#/persons" + (a.length ? "?" + a.join("&") : ""); }
    main.innerHTML = '<section class="phead"><div class="art" aria-hidden="true">' + abstractSVG(8080, 0) + '</div><div class="wrap"><p class="kicker">구술기록</p><h1>인명 사전</h1>' +
      '<p class="lede">구술에서 언급된 사람을 동일인 기준으로 정리했습니다. 호칭이 달라도 같은 사람이면 하나로 묶이고, 그 사람을 언급한 여러 구술이 한곳에 모입니다.</p>' +
      '<div class="pidx" role="group" aria-label="초성 색인"><a href="' + href({ini:""}) + '"' + (!ini ? ' aria-current="true"' : '') + ' style="width:auto;padding:6px 10px">전체</a>' +
        CHO_LIST.map(function(c){ return has[c] ? '<a href="' + href({ini:c}) + '"' + (ini === c ? ' aria-current="true"' : '') + '>' + c + '</a>' : '<span class="off" aria-hidden="true" style="width:32px;padding:6px 0;text-align:center;font-size:13.5px">' + c + '</span>'; }).join("") + '</div>' +
      '<nav class="pfilter" aria-label="인물 유형">' + PTYPES.map(function(t){ return '<a href="' + href({type:t[0]}) + '"' + (type === t[0] ? ' aria-current="true"' : '') + '>' + t[1] + '</a>'; }).join("") + '</nav>' +
      '</div></section><div class="wrap"><p class="note" aria-live="polite" style="padding-top:18px">' + list.length + '명</p><div class="pgrid">' +
      list.map(function(p){
        var ms = X.byEnt["PERSON|" + p.person_id] || [], segN = groupBySeg(ms).length;
        return '<article class="pcard"><h2><a href="#/person/' + p.person_id + '">' + esc(p.name) + '</a></h2><div class="dis">' + esc(p.disambiguation) + (p.is_sample ? " · 가상 인물" : "") + '</div>' +
          '<p>' + esc(p.summary) + '</p><div class="ft"><span>언급 ' + ms.length + '회 · 세그먼트 ' + segN + '건</span>' +
          (p.links.narrator_id ? '<span class="badge">구술자</span>' : '') + (X.nameCount[p.name] > 1 ? '<span class="badge same">동명이인 구분</span>' : '') + '</div></article>';
      }).join("") + '</div>' +
      '<p class="note" style="padding-bottom:80px;max-width:62em">공인(국회의원·공직자·언론인 등)만 사전 항목을 공개합니다. 가족·지인 등 사인(私人)은 내부 색인으로만 관리하며, 검수를 거쳐 확정된 연결만 표시합니다(노션 기획안 8.4).</p></div>';
    return "인명 사전";
  }
  function viewPerson(id){
    var p = X.person[id];
    if (!p || !p.is_public_figure){
      main.innerHTML = '<div class="wrap">' + crumb([["인명 사전", "#/persons"], ["비공개 항목"]]) + '<p class="empty">공개하지 않는 인명 사전 항목입니다.</p></div>';
      return "인명 사전";
    }
    var ms = X.byEnt["PERSON|" + id] || [];
    var groups = groupBySeg(ms);
    var surfaces = ms.map(function(m){ return m.surface; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
    var same = D.persons.filter(function(o){ return o.name === p.name && o.person_id !== id && o.is_public_figure; });
    var by = {}, order = [];
    groups.forEach(function(g){ var nid = sesOf(g.seg).narrator_id; if (!by[nid]){ by[nid] = []; order.push(nid); } by[nid].push(g); });
    var n = p.links.narrator_id ? X.nar[p.links.narrator_id] : null;

    main.innerHTML = '<div class="wrap">' + crumb([["인명 사전", "#/persons"], [p.name]]) +
      '<header class="phero"><p class="kicker">인명 사전' + (p.is_sample ? ' · 표본(가상 인물)' : '') + '</p><h1>' + esc(p.name) + (p.hanja ? '<small>' + esc(p.hanja) + '</small>' : '') + '</h1>' +
        '<p class="dis">' + esc(p.disambiguation) + '</p><p class="summary">' + esc(p.summary) + '</p>' +
        '<div class="links">' + (n ? '<a class="btn primary" href="#/narrator/' + n.id + '">' + esc(n.name) + ' 본인의 구술 보기</a>' : '') +
          (p.links.member_collection_id ? '<a class="btn" href="collection/index.html#member/' + esc(p.links.member_collection_id) + '">국회의원 컬렉션에서 보기</a>' : '') + '</div>' +
        (same.length ? '<p class="samename">같은 이름의 다른 인물이 있습니다: ' + same.map(function(o){ return '<a href="#/person/' + o.person_id + '">' + esc(o.name) + '(' + esc(o.disambiguation) + ')</a>'; }).join(", ") + '. 인명 사전은 동명이인을 구분하여 연결합니다.</p>' : '') +
        '<p class="note" style="margin-top:14px">구술 속 표기: ' + surfaces.map(function(s){ return "‘" + esc(s) + "’"; }).join(", ") + '</p>' +
      '</header>' +
      '<section class="block" style="margin-top:10px"><h2>이 인물을 언급한 구술</h2><p class="d">' + order.length + '명의 구술자가 ' + groups.length + '개 세그먼트에서 ' + ms.length + '회 언급했습니다. 구술자별로 나란히 놓았습니다.</p>' +
        (order.length ? '<div class="lanes">' + order.map(function(nid){
          var nn = X.nar[nid];
          return '<div class="lane"><h3><a href="#/narrator/' + nid + '">' + esc(nn.name) + '</a><span>' + esc(nn.headline_position) + ' · ' + by[nid].length + '건</span></h3>' +
            by[nid].map(function(g){ return segCard(g.seg, {t:firstMentionT(g.ms), snip:g.ms.map(sentenceOf).slice(0, 2).join("<br>"), noThumb:true, extra: g.ms.length + "회 언급"}); }).join("") + '</div>';
        }).join("") + '</div>' : '<p class="empty">공개된 구술에서 이 인물을 언급한 대목이 없습니다.</p>') +
      '</section><div style="height:90px"></div></div>';
    return p.name + " — 인명 사전";
  }

  /* ============================================================ 이벤트 위임 */
  document.addEventListener("click", function(ev){
    var t = ev.target;
    var ent = t.closest("[data-ent]");
    if (ent){ ev.preventDefault(); ev.stopPropagation(); openEnt(ent.dataset.ent, ent); return; }
    if (t.closest("[data-close]")){ closePop(); return; }
    if (!pop.hidden && !pop.contains(t)) closePop(true);
    var sk = t.closest("[data-seek]");
    if (sk){ ev.preventDefault(); seekTo(parseFloat(sk.dataset.seek)); var ve = $("#vend"); if (ve) ve.hidden = true; return; }
    var pa = t.closest("#txbody .pa");
    if (pa && P && !t.closest("a,button") && !window.getSelection().toString()){ seekTo(parseFloat(pa.dataset.t)); return; }
    var cp = t.closest("[data-copy]");
    if (cp){
      var k = cp.dataset.copy;
      if (k === "url") copy(location.href.split("?")[0].replace(/\?.*$/, ""), "링크를 복사했습니다");
      else if (k === "urlt" && P) copy(location.href.split("?")[0] + "?t=" + now().toFixed(1), "현재 위치 링크를 복사했습니다");
      else if (k === "cite") copy($("#cite").textContent, "인용 표기를 복사했습니다");
      else if (k === "text") copy(cp.dataset.text, "공유 문구를 복사했습니다");
      else if (k === "seglink") copy(location.href.split("#")[0] + "#/segment/" + cp.dataset.id, "구간 링크를 복사했습니다");
      return;
    }
    var dl = t.closest("[data-dl]");
    if (dl){
      var seg = X.seg[parseHash().parts[1]];
      if (dl.dataset.dl === "seg") download(seg.id + "_녹취문.txt", transcriptText(seg) + fileFooter());
      else {
        var s = sesOf(seg);
        download(s.id + "_전체녹취문.txt", X.segsBySes[s.id].map(transcriptText).join("\n\n") + fileFooter());
      }
      return;
    }
    var tb = t.closest("[data-toast]");
    if (tb){ toast(tb.dataset.toast); return; }
    var pl = t.closest("[data-place]");
    if (pl && MAPSTATE){ selectPlace(pl.dataset.place, true); return; }
    var hb = t.closest("button[data-href]");
    if (hb){ location.href = hb.dataset.href; return; }
  });
  document.addEventListener("keydown", function(ev){
    if (ev.key === "Escape" && !pop.hidden){ closePop(); return; }
    var g = ev.target.closest && ev.target.closest("g[data-place]");
    if (g && (ev.key === "Enter" || ev.key === " ")){ ev.preventDefault(); selectPlace(g.dataset.place, true); }
  });
  document.getElementById("topsearch").addEventListener("submit", function(ev){
    ev.preventDefault();
    var v = $("#topq").value.trim();
    if (v) go("#/search?q=" + encodeURIComponent(v));
  });

  /* ============================================================ 시작 */
  function chrome(){
    var S = D.site;
    $("#notice").innerHTML = '<div class="wrap"><span><b>' + esc(S.prototype_version) + '</b> — 국회기록원 홈페이지 개편 참조물</span><span><b>표본 데이터</b> — ' + esc(S.sample_notice) + '</span></div>';
    $("#foot").innerHTML = '<div class="wrap"><span class="brand" aria-hidden="true"></span><p>' + esc(S.footer.address) + '</p><p>' + esc(S.footer.contact) + '</p><p>' + esc(S.footer.copyright) + '</p>' +
      '<p class="proto">' + esc(S.prototype_version) + ' · 기준일 ' + dateK(S.base_date) + ' · 화면 코드: OH-01·02·03·04·05·07·08, 구술기록 검색</p></div>';
  }
  loadData().then(function(d){
    D = d; buildIndex(); chrome();
    window.addEventListener("hashchange", route);
    route();
  }).catch(function(e){
    console.error(e);
    main.innerHTML = '<div class="wrap"><p class="empty">데이터를 불러오지 못했습니다. 시연하기.command로 로컬 서버를 띄워 여십시오.</p></div>';
  });
})();
