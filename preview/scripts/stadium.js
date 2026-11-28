/* Original court and players. World axes are length, height, and width. */
"use strict";
// Build each local joint basis and compose it with its parent into a column-major palette.
function jointFrame(out, id, parent, x, y, z, pitch = 0, yaw = 0, bank = 0) {
  const a = Math.cos(pitch),
    b = Math.sin(pitch),
    c = Math.cos(yaw),
    d = Math.sin(yaw),
    e = Math.cos(bank),
    f = Math.sin(bank);
  const m = [
    c * e + d * b * f,
    a * f,
    -d * e + c * b * f,
    -c * f + d * b * e,
    a * e,
    d * f + c * b * e,
    d * a,
    -b,
    c * a
  ];
  const off = id * 16,
    base = parent * 16;
  for (let k = 0; k < 4; k++) {
    const u = k === 3 ? x : m[3 * k],
      v = k === 3 ? y : m[3 * k + 1],
      w = k === 3 ? z : m[3 * k + 2];
    for (let j = 0; j < 3; j++)
      out[off + 4 * k + j] =
        parent < 0
          ? [u, v, w][j]
          : out[base + j] * u +
            out[base + 4 + j] * v +
            out[base + 8 + j] * w +
            (k === 3 ? out[base + 12 + j] : 0);
    out[off + 4 * k + 3] = k === 3 ? 1 : 0;
  }
}
function createStadium(canvas) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const v = (a, b) => a.map((n, i) => n - b[i]);
  const add = (a, b) => a.map((n, i) => n + b[i]);
  const mul = (a, k) => a.map((n) => n * k);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const unit = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
  const mix = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
  const tau = 2 * Math.PI,
    sun = unit([-0.5, 0.9, 0.65]);
  const colorCache = new Map();
  function rgb(hex) {
    if (!colorCache.has(hex))
      colorCache.set(
        hex,
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      );
    return colorCache.get(hex);
  }
  let mesh = [];
  function face(a, b, c, color, brightness) {
    const light = brightness ?? 0.73 + 0.34 * Math.max(0, dot(unit(cross(v(b, a), v(c, a))), sun));
    const [r, g, bl] = rgb(color);
    mesh.push(
      ...a,
      r * light,
      g * light,
      bl * light,
      ...b,
      r * light,
      g * light,
      bl * light,
      ...c,
      r * light,
      g * light,
      bl * light
    );
  }
  function quad(a, b, c, d, col, light) {
    face(a, b, c, col, light);
    face(a, c, d, col, light);
  }
  function box(x, y, z, w, h, d, col) {
    const X = x + w / 2,
      L = x - w / 2,
      F = z + d / 2,
      B = z - d / 2,
      T = y + h;
    const p = [
      [L, y, B],
      [X, y, B],
      [X, y, F],
      [L, y, F],
      [L, T, B],
      [X, T, B],
      [X, T, F],
      [L, T, F]
    ];
    for (const [a, b, c, d] of [
      [4, 7, 6, 5],
      [3, 2, 6, 7],
      [2, 1, 5, 6],
      [1, 0, 4, 5],
      [0, 3, 7, 4],
      [0, 1, 2, 3]
    ])
      quad(p[a], p[b], p[c], p[d], col);
  }
  function pipe(a, b, r1, r2, col, n = 7) {
    const axis = unit(v(b, a)),
      u = unit(cross(axis, Math.abs(axis[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0])),
      w = cross(axis, u);
    let oldA, oldB;
    for (let i = 0; i <= n; i++) {
      const k = (i * tau) / n,
        rim = add(mul(u, Math.cos(k)), mul(w, Math.sin(k))),
        pa = add(a, mul(rim, r1)),
        pb = add(b, mul(rim, r2));
      if (i) {
        quad(oldA, pa, pb, oldB, col);
        face(b, oldB, pb, col);
        face(a, pa, oldA, col);
      }
      oldA = pa;
      oldB = pb;
    }
  }
  function blob(x, y, z, rx, ry, rz, color, n = 10, rows = 6) {
    function vertex(i, j) {
      const th = (tau * i) / n,
        ph = (Math.PI * j) / rows;
      return [
        x + rx * Math.sin(ph) * Math.cos(th),
        y + ry * Math.cos(ph),
        z + rz * Math.sin(ph) * Math.sin(th)
      ];
    }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++)
        quad(vertex(i, j), vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1), color);
  }
  function stripe(x, z, X, Z, width, col, y = 0.018) {
    const dx = X - x,
      dz = Z - z,
      len = Math.hypot(dx, dz) || 1,
      a = (-dz * width) / (2 * len),
      b = (dx * width) / (2 * len);
    quad([x + a, y, z + b], [X + a, y, Z + b], [X - a, y, Z - b], [x - a, y, z - b], col, 1);
  }
  function ring(x, z, rx, rz, width, col, y = 0.024, n = 52) {
    for (let i = 0; i < n; i++) {
      let a = (i * tau) / n,
        b = ((i + 1) * tau) / n;
      stripe(
        x + rx * Math.cos(a),
        z + rz * Math.sin(a),
        x + rx * Math.cos(b),
        z + rz * Math.sin(b),
        width,
        col,
        y
      );
    }
  }
  function disk(x, z, rx, rz, col, y = 0.04, n = 22) {
    for (let i = 0; i < n; i++) {
      const a = (i * tau) / n,
        b = ((i + 1) * tau) / n;
      face(
        [x, y, z],
        [x + rx * Math.cos(b), y, z + rz * Math.sin(b)],
        [x + rx * Math.cos(a), y, z + rz * Math.sin(a)],
        col,
        1
      );
    }
  }
  const glyphs = {
    A: "010101111101101",
    C: "111100100100111",
    D: "110101101101110",
    E: "111100110100111",
    G: "111100101101111",
    H: "101101111101101",
    K: "101110100110101",
    L: "100100100100111",
    U: "101101101101111",
    0: "111101101101111",
    1: "010110010010111",
    4: "101101111001001",
    7: "111001010010010",
    8: "111101111101111",
    9: "111101111001111"
  };
  function sign(word, x, y, z, s, col) {
    for (const ch of word) {
      const bits = glyphs[ch];
      if (bits)
        for (let i = 0; i < 15; i++)
          if (bits[i] === "1") {
            const X = x + (i % 3) * s,
              Y = y - Math.floor(i / 3) * s;
            quad([X, Y, z], [X + s, Y, z], [X + s, Y - s, z], [X, Y - s, z], col, 1);
          }
      x += s * 4;
    }
  }
  let seed = 17021;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const navy = "#192d41",
    cream = "#fff1cc",
    mint = "#44edaf",
    coral = "#ff684b";
  function city() {
    const walls = ["#c2927b", "#bc7871", "#d4a283", "#8d8994", "#ad8b83", "#bba18a"];
    box(0, -8.4, -24, 194, 1, 121, "#aa8c82");
    for (let row = 0; row < 2; row++) {
      let x = -86;
      while (x < 86) {
        const w = 3 + random() * 5,
          depth = 3 + random() * 4,
          z = -19 - row * 15 - random() * 5,
          top = 1 + random() * (row ? 12 : 7),
          col = walls[Math.floor(random() * walls.length)];
        const buildingStart = mesh.length;
        box(x, -7, z, w, top + 7, depth, col);
        box(x, top, z, w + 0.25, 0.18, depth + 0.25, "#d3af98");
        for (let j = -2.8; j < top - 0.7; j += 1.45)
          for (let k = x - w / 2 + 0.45; k < x + w / 2 - 0.35; k += 1.05) {
            const front = z + depth / 2 + 0.025;
            quad(
              [k, j, front],
              [k + 0.52, j, front],
              [k + 0.52, j + 0.72, front],
              [k, j + 0.72, front],
              random() < 0.21 ? "#f2c38b" : "#665d6a",
              0.95
            );
          }
        if (!row && random() < 0.7) {
          const front = z + depth / 2;
          for (let y = -2.6; y < top - 0.8; y += 2.9) {
            box(x - 0.18 * w, y, front + 0.21, w * 0.45, 0.12, 0.64, "#deb194");
            box(x - 0.18 * w, y + 0.5, front + 0.52, w * 0.45, 0.045, 0.045, "#625d68");
            for (let j = -1; j <= 1; j++)
              box(x - 0.18 * w + j * w * 0.2, y, front + 0.52, 0.04, 0.53, 0.04, "#625d68");
          }
        }
        if (random() < 0.55) {
          const tx = x + 0.2,
            ty = top + 0.24;
          pipe([tx, ty, z], [tx, ty + 1.05, z], 0.72, 0.72, "#595767", 10);
          pipe([tx, ty + 1.05, z], [tx, ty + 1.2, z], 0.76, 0.54, "#454954", 10);
        } else {
          box(x, top + 0.1, z, w * 0.35, 0.8, depth * 0.46, "#b69a8c");
        }
        // Reuse this block of rooflines round the corner, behind the attacking goal.
        if (!row && Math.abs(x) < 23) {
          const buildingEnd = mesh.length;
          for (let i = buildingStart; i < buildingEnd; i += 6)
            mesh.push(13 - mesh[i + 2], mesh[i + 1], mesh[i], mesh[i + 3], mesh[i + 4], mesh[i + 5]);
        }
        x += w + 1.6;
      }
    }
  }
  function goalMesh(side) {
    const x = side * 20,
      back = x + side * 1.18,
      h = 2.24,
      wide = 2.8;
    for (const s of [-1, 1]) {
      const z = s * wide;
      pipe([x, 0.02, z], [x, h, z], 0.075, 0.075, cream);
      pipe([x, h, z], [back, h * 0.8, z], 0.056, 0.056, cream);
      pipe([back, 0.02, z], [back, h * 0.8, z], 0.06, 0.06, cream);
      for (let k = 1; k < 6; k++) {
        const y = (k * h) / 6;
        pipe([x, y, z], [back, y * 0.8, z], 0.014, 0.014, "#a9cfc3", 4);
      }
    }
    pipe([x, h, -wide], [x, h, wide], 0.075, 0.075, cream);
    pipe([back, h * 0.8, -wide], [back, h * 0.8, wide], 0.05, 0.05, cream);
    for (let z = -wide; z <= wide + 0.01; z += 0.31) {
      pipe([back, 0.02, z], [back, h * 0.8, z], 0.014, 0.014, "#b7d5cb", 4);
      pipe([x, h, z], [back, h * 0.8, z], 0.014, 0.014, "#b7d5cb", 4);
    }
    for (let j = 1; j < 6; j++)
      pipe(
        [back, (h * 0.8 * j) / 6, -wide],
        [back, (h * 0.8 * j) / 6, wide],
        0.014,
        0.014,
        "#bdd6cc",
        4
      );
  }
  function stands() {
    for (let s = 0; s < 3; s++) {
      const z = -11.15 - s * 0.72,
        y = 0.23 + s * 0.42;
      box(0, 0, z, 32, y, 0.83, "#344759");
      box(0, y, z, 32, 0.1, 0.83, "#d19579");
      for (let i = 0; i < 32; i++) {
        if (random() < 0.35) continue;
        const x = -15.5 + i + 0.18 * random(),
          skin = ["#a96c50", "#d99c73", "#8f584a"][i % 3];
        box(
          x,
          y + 0.08,
          z,
          0.35,
          0.47,
          0.33,
          [mint, coral, "#e9aa50", "#456984", "#f5ddb1"][Math.floor(random() * 5)]
        );
        blob(x, y + 0.7, z, 0.15, 0.18, 0.15, skin, 6, 3);
      }
    }
    for (let x of [-21.8, 21.8]) {
      pipe([x, 0, -10], [x, 6.3, -10], 0.11, 0.075, navy);
      box(x, 6.1, -10, 2.1, 0.68, 0.35, navy);
      for (let j = -2; j <= 2; j++) box(x + j * 0.39, 6.2, -9.8, 0.31, 0.42, 0.06, "#fff0b4");
    }
    for (let x = -20; x < 20; x += 2.2) {
      box(x, 0.62, -9.82, 0.075, 2.22, 0.075, navy);
    }
    for (let h of [0.9, 1.55, 2.2, 2.85]) box(0, h, -9.82, 41, 0.025, 0.035, "#818b85");
    for (let i = 0; i < 27; i++) {
      const x = -20.3 + i * 1.52,
        z = -10.05,
        y = 2.95 + 0.42 * Math.cos(i * 0.43);
      const next = 2.95 + 0.42 * Math.cos((i + 1) * 0.43);
      pipe([x, y, z], [x + 1.52, next, z], 0.018, 0.018, navy, 4);
      face(
        [x + 0.12, y, z],
        [x + 0.91, y - 0.04, z],
        [x + 0.46, y - 0.61, z + 0.09],
        [cream, mint, coral, "#ffc354"][i % 4],
        1
      );
    }
  }
  let turfStart, fixturesStart;
  function buildCourt() {
    city();
    stands();
    box(0, -5.4, 0, 45.5, 5.13, 21.5, "#b97e69");
    box(0, -0.27, 0, 45.7, 0.26, 21.7, "#eab289");
    box(0, -0.08, 0, 40, 0.08, 18, "#378f86");
    turfStart = mesh.length;
    for (let i = 0; i < 10; i++) {
      const x = -20 + i * 4;
      quad(
        [x, 0.005, -9],
        [x, 0.005, 9],
        [x + 4, 0.005, 9],
        [x + 4, 0.005, -9],
        i % 2 ? "#398f83" : "#3d9789",
        1
      );
    }
    for (let i = 0; i < 440; i++) {
      let x = random() * 39.5 - 19.75,
        z = random() * 17.6 - 8.8;
      stripe(x, z, x + 0.03 + random() * 0.16, z + 0.015, 0.013, "#65a599", 0.009);
    }
    function outline(x, z, X, Z) {
      stripe(x, z, X, z, 0.084, cream);
      stripe(X, z, X, Z, 0.084, cream);
      stripe(X, Z, x, Z, 0.084, cream);
      stripe(x, Z, x, z, 0.084, cream);
    }
    outline(-19.95, -8.94, 19.95, 8.94);
    stripe(0, -8.9, 0, 8.9, 0.085, cream);
    ring(0, 0, 2.65, 2.65, 0.085, cream);
    disk(0, 0, 0.11, 0.11, cream);
    for (let s of [-1, 1]) {
      outline(19.94 * s, -4.95, 14.5 * s, 4.95);
      outline(19.94 * s, -2.72, 17.92 * s, 2.72);
      disk(16 * s, 0, 0.13, 0.13, cream);
    }
    fixturesStart = mesh.length;
    for (const s of [-1, 1]) goalMesh(s);
    for (let i = 0; i < 9; i++) {
      const x = -20 + i * 5;
      box(x, 0.02, -9.49, 4.96, 0.82, 0.25, i % 3 === 1 ? "#ed825e" : navy);
      sign(i % 3 === 1 ? "DHAKA" : "CHHAD", x - 1.02, 0.66, -9.35, 0.105, cream);
    }
    for (let s of [-1, 1])
      for (let j = 0; j < 2; j++) {
        const z = (j ? 1 : -1) * 6.35;
        box(s * 21.45, 0.02, z, 0.25, 0.72, 5, "#355768");
      }
  }
  buildCourt();
  const staticMesh = new Float32Array(mesh);
  mesh = [];
  // A truncated icosahedron gives the football stitched pentagon and hexagon panels.
  const phi = (1 + Math.sqrt(5)) / 2,
    icos = [];
  for (let a of [-1, 1])
    for (let b of [-phi, phi]) icos.push(unit([0, a, b]), unit([a, b, 0]), unit([b, 0, a]));
  const adj = icos.map((p) =>
    icos
      .map((q, i) => [i, Math.hypot(...v(p, q))])
      .filter((e) => e[1] > 0.01)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 5)
      .map((e) => e[0])
  );
  function panel(points, c) {
    const center = mul(points.reduce(add, [0, 0, 0]), 1 / points.length);
    for (let j = 0; j < points.length; j++) {
      let a = points[j],
        b = points[(j + 1) % points.length];
      if (dot(cross(v(a, center), v(b, center)), center) < 0) [a, b] = [b, a];
      face(center, a, b, c);
    }
  }
  function cut(i, j) {
    return unit(mix(icos[i], icos[j], 1 / 3));
  }
  for (let i = 0; i < 12; i++) {
    const axis = icos[i],
      base = unit(cross(axis, [0.31, 0.82, 0.22])),
      up = cross(axis, base);
    panel(
      adj[i]
        .map((j) => cut(i, j))
        .sort((a, b) => Math.atan2(dot(a, up), dot(a, base)) - Math.atan2(dot(b, up), dot(b, base))),
      navy
    );
    for (const j of adj[i])
      for (const k of adj[j])
        if (i < j && j < k && adj[i].includes(k))
          panel([cut(i, j), cut(j, i), cut(j, k), cut(k, j), cut(k, i), cut(i, k)], "#fff5d8");
  }
  const ballModel = new Float32Array(mesh);
  mesh = [];
  function football(x, y, z, q, r = 0.166) {
    const [a, b, c, w] = q;
    for (let i = 0; i < ballModel.length; i += 6) {
      const X = ballModel[i],
        Y = ballModel[i + 1],
        Z = ballModel[i + 2];
      const tx = 2 * (b * Z - c * Y),
        ty = 2 * (c * X - a * Z),
        tz = 2 * (a * Y - b * X);
      mesh.push(
        x + r * (X + w * tx + b * tz - c * ty),
        y + r * (Y + w * ty + c * tx - a * tz),
        z + r * (Z + w * tz + a * ty - b * tx),
        ballModel[i + 3],
        ballModel[i + 4],
        ballModel[i + 5]
      );
    }
  }
  const worldX = (x) => (x - 500) * 0.04,
    worldZ = (y) => (y - 225) * 0.04;
  // One indexed joint per rigid section. Rounded, overlapping ends keep elbows and knees closed.
  const posedActors = [];
  function makeKit(id, keeper = false) {
    const vertices = [],
      shirt = keeper ? (id < 2 ? "#ffd55e" : "#9397ff") : id < 2 ? "#42d9ac" : "#ef684e",
      dark = id < 2 ? "#163d4a" : "#37374b",
      trim = id < 2 ? "#d6ffe6" : "#ffe3b1";
    const skin = ["#b77350", "#cb8a65", "#91593f", "#cb8762"][id],
      hair = ["#29242a", "#372b28", "#24252c", "#402b25"][id],
      boots = ["#e5ede1", "#efad47", "#eae4cb", "#263542"][id];
    const floorRings = keeper ? Array.from({ length: 15 }, () => []) : null;
    let joint = 0;
    function vertex(p, n, col) {
      vertices.push(...p, ...rgb(col), ...n, joint);
    }
    // Elliptical cross-sections with shared analytic normals shade continuously around each limb.
    function loft(rows, col, n = 14) {
      if (floorRings)
        for (const [y, rx, rz, z = 0, x = 0] of rows) floorRings[joint].push(x, y, z, rx, rz);
      function point(i, j) {
        const [y, rx, rz, z = 0, x = 0] = rows[j],
          a = (i * tau) / n,
          cs = Math.cos(a),
          sn = Math.sin(a);
        const prev = rows[Math.max(0, j - 1)],
          next = rows[Math.min(rows.length - 1, j + 1)];
        const along = [
          (next[1] - prev[1]) * cs + (next[4] || 0) - (prev[4] || 0),
          next[0] - prev[0],
          (next[2] - prev[2]) * sn + (next[3] || 0) - (prev[3] || 0)
        ];
        return [[x + rx * cs, y, z + rz * sn], unit(cross(along, [-rx * sn, 0, rz * cs]))];
      }
      const rings = rows.map((_, j) => Array.from({ length: n }, (_, i) => point(i, j)));
      for (let j = 0; j < rings.length - 1; j++)
        for (let i = 0; i < n; i++) {
          const k = (i + 1) % n,
            c = typeof col === "function" ? col(j, ((i + 0.5) * tau) / n) : col;
          for (const pt of [
            rings[j][i],
            rings[j + 1][i],
            rings[j + 1][k],
            rings[j][i],
            rings[j + 1][k],
            rings[j][k]
          ])
            vertex(...pt, c);
        }
      for (const j of [0, rows.length - 1]) {
        const row = rows[j],
          normal = [0, j ? 1 : -1, 0];
        for (let i = 0; i < n; i++) {
          const c = typeof col === "function" ? col(j ? j - 1 : 0, ((i + 0.5) * tau) / n) : col;
          vertex([row[4] || 0, row[0], row[3] || 0], normal, c);
          vertex(rings[j][i][0], normal, c);
          vertex(rings[j][(i + 1) % n][0], normal, c);
        }
      }
    }
    function oval(x, y, z, rx, ry, rz, c) {
      const rows = [];
      for (let j = 0; j <= 8; j++) {
        const a = -Math.PI / 2 + (j * Math.PI) / 8,
          r = Math.max(0.012, Math.cos(a));
        rows.push([y + ry * Math.sin(a), rx * r, rz * r, z, x]);
      }
      loft(rows, c, 14);
    }
    function patch(a, b, c, d, color) {
      if (floorRings) for (const [x, y, z] of [a, b, c, d]) floorRings[joint].push(x, y, z, 0, 0);
      const norm = unit(cross(v(b, a), v(c, a)));
      for (const p of [a, b, c, a, c, d]) vertex(p, norm, color);
    }
    function number(ch, x, y, z, s, back = false) {
      const dir = back ? -1 : 1;
      for (let i = 0; i < 15; i++)
        if (glyphs[ch][i] === "1") {
          const X = x + dir * (i % 3) * s,
            Y = y - Math.floor(i / 3) * s;
          patch([X, Y, z], [X, Y - s, z], [X + dir * s, Y - s, z], [X + dir * s, Y, z], trim);
        }
    }
    loft(
      [
        [-0.12, 0.194, 0.126, -0.015],
        [0, 0.224, 0.145, -0.012],
        [0.11, 0.208, 0.14]
      ],
      dark
    );
    joint = 1;
    const jersey = [
      [0.035, 0.211, 0.148],
      [0.082, 0.218, 0.148],
      [0.18, 0.192, 0.134],
      [0.31, 0.202, 0.146],
      [0.46, 0.244, 0.17, 0.007],
      [0.55, 0.269, 0.154],
      [0.605, 0.234, 0.125, -0.004],
      [0.64, 0.107, 0.095]
    ];
    loft(jersey, (j, a) => (j === 0 ? dark : Math.abs(Math.cos(a)) > 0.94 && j < 5 ? dark : shirt), 22);
    loft(
      [
        [0.628, 0.116, 0.104],
        [0.65, 0.097, 0.085]
      ],
      dark
    );
    loft(
      [
        [0.639, 0.085, 0.073],
        [0.734, 0.076, 0.074, 0.012]
      ],
      skin
    );
    function stripePoint(t, offset) {
      const x = -0.172 + 0.306 * t + offset,
        y = 0.545 - 0.348 * t,
        j = jersey.findIndex((row) => row[0] > y),
        a = jersey[j - 1],
        b = jersey[j],
        f = (y - a[0]) / (b[0] - a[0]);
      const rx = a[1] + (b[1] - a[1]) * f,
        rz = a[2] + (b[2] - a[2]) * f,
        center = (a[3] || 0) * (1 - f) + (b[3] || 0) * f;
      return [x, y, center + rz * Math.sqrt(1 - (x / rx) ** 2) + 0.0018];
    }
    for (let j = 0; j < 14; j++) {
      const a = j / 14,
        b = (j + 1) / 14;
      patch(
        stripePoint(a, -0.01),
        stripePoint(b, -0.01),
        stripePoint(b, 0.01),
        stripePoint(a, 0.01),
        trim
      );
    }
    number(keeper ? "1" : ["9", "7", "8", "4"][id], 0.066, 0.494, 0.179, 0.021);
    number(keeper ? "1" : ["9", "7", "8", "4"][id], 0.066, 0.515, -0.168, 0.044, true);
    joint = 2;
    loft(
      [
        [0.002, 0.053, 0.063, 0.05],
        [0.027, 0.095, 0.102, 0.036],
        [0.073, 0.124, 0.124, 0.023],
        [0.137, 0.139, 0.145, 0.017],
        [0.205, 0.145, 0.145, 0.006],
        [0.266, 0.132, 0.135],
        [0.313, 0.096, 0.105],
        [0.338, 0.015, 0.024]
      ],
      skin,
      22
    );
    for (const s of [-1, 1]) {
      oval(s * 0.139, 0.145, 0.002, 0.023, 0.043, 0.023, skin);
      oval(s * 0.054, 0.175, 0.149, 0.025, 0.009, 0.007, "#f7e2ca");
      oval(s * 0.054, 0.176, 0.154, 0.011, 0.009, 0.005, hair);
      oval(s * 0.058, 0.202, 0.143, 0.035, 0.007, 0.008, hair);
    }
    oval(0, 0.142, 0.159, 0.021, 0.033, 0.03, skin);
    oval(0, 0.087, 0.147, 0.034, 0.005, 0.004, "#91594c");
    loft(
      [
        [0.183, 0.144, 0.143, -0.022],
        [0.23, 0.152, 0.147, -0.012],
        [0.282, 0.144, 0.14, -0.01],
        [0.329, 0.109, 0.114],
        [0.355, 0.036, 0.047]
      ],
      hair,
      20
    );
    if (id === 1) oval(0, 0.328, -0.103, 0.08, 0.087, 0.08, hair);
    if (id === 2)
      loft(
        [
          [0.228, 0.154, 0.148, -0.01],
          [0.249, 0.155, 0.151, -0.01]
        ],
        trim,
        20
      );
    if (id === 0 || id === 3)
      for (let j = 0; j < 6; j++) {
        const a = 0.2 + j * 0.49;
        oval(
          0.106 * Math.cos(a),
          0.297 + 0.012 * Math.sin(a),
          0.106 * Math.sin(a),
          0.055,
          0.052,
          0.052,
          hair
        );
      }
    for (let k = 0; k < 2; k++) {
      joint = 3 + k * 3;
      loft(
        [
          [-0.483, 0.066, 0.07, 0.014],
          [-0.395, 0.084, 0.085, 0.012],
          [-0.27, 0.111, 0.116, 0.003],
          [-0.13, 0.122, 0.13],
          [0.043, 0.09, 0.101]
        ],
        skin
      );
      loft(
        [
          [-0.235, 0.118, 0.123],
          [-0.207, 0.124, 0.13],
          [-0.1, 0.13, 0.142],
          [0.025, 0.115, 0.123]
        ],
        (j, a) => (Math.abs(Math.cos(a)) > 0.94 ? trim : dark)
      );
      joint++;
      loft(
        [
          [-0.459, 0.046, 0.055],
          [-0.36, 0.056, 0.065, -0.015],
          [-0.24, 0.078, 0.09, -0.034],
          [-0.14, 0.089, 0.098, -0.028],
          [-0.058, 0.078, 0.079],
          [0.03, 0.069, 0.071]
        ],
        (j) => (j >= 4 ? skin : j === 3 ? trim : shirt)
      );
      joint++;
      loft(
        [
          [-0.09, 0.048, 0.138, 0.071],
          [-0.078, 0.079, 0.164, 0.071],
          [-0.049, 0.082, 0.169, 0.073],
          [-0.012, 0.078, 0.149, 0.055],
          [0.047, 0.056, 0.078, 0.006]
        ],
        (j) => (j <= 1 ? dark : boots)
      );
      for (let a = 0; a < 3; a++)
        oval(0, 0.013 - a * 0.009, 0.068 + a * 0.029, 0.046, 0.006, 0.007, trim);
      joint = 9 + k * 3;
      loft(
        [
          [-0.302, 0.049, 0.055],
          [-0.239, 0.059, 0.065],
          [-0.14, 0.08, 0.084],
          [-0.039, 0.095, 0.096],
          [0.034, 0.062, 0.067]
        ],
        skin
      );
      loft(
        [
          [-0.15, 0.083, 0.09],
          [-0.131, 0.088, 0.095],
          [-0.041, 0.106, 0.102],
          [0.04, 0.073, 0.07]
        ],
        (j) => (j === 0 ? trim : shirt)
      );
      joint++;
      loft(
        [
          [-0.26, 0.038, 0.041],
          [-0.19, 0.044, 0.048],
          [-0.096, 0.059, 0.062],
          [0.013, 0.051, 0.056]
        ],
        skin
      );
      if (id === 0 || id === 3)
        loft(
          [
            [-0.24, 0.042, 0.045],
            [-0.204, 0.045, 0.049]
          ],
          trim
        );
      joint++;
      if (keeper) {
        oval(0, -0.06, 0.019, 0.085, 0.12, 0.059, "#f7ebcc");
        oval(0, -0.005, -0.015, 0.066, 0.039, 0.056, dark);
      } else {
        oval(0, -0.046, 0.011, 0.045, 0.075, 0.032, skin);
        oval(k ? -0.034 : 0.034, -0.045, 0.03, 0.018, 0.036, 0.02, skin);
      }
    }
    return {
      data: new Float32Array(vertices),
      buffer: null,
      bones: new Float32Array(15 * 16),
      floorRings
    };
  }
  const kits = [...Array.from({ length: 4 }, (_, i) => makeKit(i)), makeKit(1, true), makeKit(2, true)];
  function groundKeeper(k, flight) {
    const bones = k.bones,
      rings = kits[4 + k.team].floorRings;
    let lowest = Infinity;
    for (let j = 0; j < rings.length; j++) {
      const o = j * 16,
        ax = bones[o + 1],
        ay = bones[o + 5],
        az = bones[o + 9],
        points = rings[j];
      for (let i = 0; i < points.length; i += 5) {
        const center = bones[o + 13] + ax * points[i] + ay * points[i + 1] + az * points[i + 2];
        // The lower edge of a tilted elliptical mesh ring along the world's vertical axis.
        const dx = ax * points[i + 3],
          dz = az * points[i + 4];
        lowest = Math.min(lowest, center - Math.sqrt(dx * dx + dz * dz));
      }
    }
    const floor = 0.022,
      shift = floor - lowest + Math.max(0, lowest - floor) * flight;
    for (let i = 13; i < bones.length; i += 16) bones[i] += shift;
  }
  function poseAthlete(p, bones, t, celebrate) {
    const x = worldX(p.x),
      z = worldZ(p.y);
    const gait = Math.min(1, p.pace / 155),
      phase = p.step,
      beat = Math.sin(phase),
      sprint = Math.min(1, Math.max(0, (p.pace - 155) / 145));
    const act = p.strike,
      pose = strikePose(p),
      load = pose.load,
      swing = pose.swing,
      hold = pose.weight;
    const skill = p.skill,
      wind = skill ? clamp(skill.clock / skillMoves[skill.name].plant, 0, 1) : 0;
    const fake = skill ? Math.sin(Math.PI * wind) : 0,
      shift = skill ? skill.side * fake : 0;
    const shoulder = shift * (skill?.name === "feint" ? 0.58 : 0.2),
      wrong = p.wrongFoot ? Math.sin(Math.PI * clamp(p.wrongFoot.left / 0.4, 0, 1)) : 0;
    const idle = Math.sin(t * 2.45 + p.i * 1.9),
      hipY =
        0.988 +
        gait * (0.025 - 0.088 * Math.cos(phase) ** 2) +
        0.005 * idle -
        0.037 * load -
        0.105 * fake -
        0.056 * wrong +
        (celebrate ? 0.19 * Math.abs(Math.sin(t * 6)) : 0);
    const twist = 0.105 * beat * gait * (1 - hold),
      tilt = p.bank || 0,
      bodyAngle = p.heading;
    jointFrame(
      bones,
      0,
      -1,
      x,
      hipY,
      z,
      0,
      bodyAngle + twist - shift * 0.13,
      -0.035 * beat * gait + tilt * 0.04 + shoulder * 0.37
    );
    jointFrame(
      bones,
      1,
      0,
      0,
      0.015,
      0,
      0.07 + gait * 0.118 + sprint * 0.085 + 0.1 * load,
      -2 * twist - 0.28 * load + 0.3 * swing,
      -tilt * 0.06 - 0.065 * load + shoulder * 0.68
    );
    jointFrame(
      bones,
      2,
      1,
      0,
      0.712,
      0.005,
      -0.1 - 0.11 * gait,
      0.065 * beat * gait + 0.11 * load,
      tilt * 0.045
    );
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1,
        a = phase + (k ? 0 : Math.PI),
        cycle = (((a / tau) % 1) + 1) % 1,
        contact = 0.52 - 0.12 * gait,
        stance = cycle < contact;
      const u = stance ? cycle / contact : (cycle - contact) / (1 - contact),
        amplitude = (0.43 + 0.15 * sprint) * gait;
      let forward = amplitude * (stance ? 1 - 2 * u : -Math.cos(Math.PI * u)),
        lift = stance ? 0 : Math.sin(Math.PI * u) * (0.22 + 0.15 * sprint) * gait;
      let ankleX = s * 0.137,
        footPitch = stance ? -0.1 * gait * Math.cos(Math.PI * u) : 0.38 * gait * Math.sin(tau * u);
      if (ball.owner === p.i && !act) {
        forward += 0.067 * Math.max(0, Math.cos(a)) * gait;
      }
      let hipRoll = 0;
      if (skill && fake > 0) {
        // Sweep the selling boot from the inside across the front of the ball, then plant wide.
        const sells = s === -skill.side;
        if (sells && skill.name === "stepover") {
          const arc = Math.PI * wind;
          forward = forward * (1 - fake) + (0.29 + 0.19 * Math.sin(arc)) * fake;
          lift = lift * (1 - fake) + 0.3 * fake;
          hipRoll = s * (-0.24 * Math.cos(arc) + 0.18) * fake;
          footPitch -= 0.27 * fake;
        } else if (sells) {
          hipRoll = s * 0.25 * fake;
          forward = forward * (1 - fake) + 0.1 * fake;
          lift *= 1 - fake;
        } else {
          lift *= 1 - fake;
          forward *= 1 - 0.8 * fake;
        }
      }
      if (hold > 0) {
        const strikeLeg = k === 1;
        const kickZ = strikeLeg ? -0.32 * load + 0.56 * swing : 0.055,
          kickY = strikeLeg ? 0.24 * load + 0.23 * swing : 0;
        forward += (kickZ - forward) * hold;
        lift += (kickY - lift) * hold;
        ankleX += s * 0.035 * hold;
        footPitch += (strikeLeg ? 0.68 * load - 0.32 * swing : 0) * hold;
      }
      const leg = 3 + k * 3,
        drop = hipY - 0.092 - lift,
        L = 0.473,
        S = 0.455,
        D = Math.min(L + S - 0.0001, Math.max(0.25, Math.hypot(drop, forward)));
      const thigh =
        Math.atan2(forward, drop) +
        Math.acos(Math.max(-1, Math.min(1, (L * L + D * D - S * S) / (2 * L * D))));
      const shin = Math.atan2(forward - L * Math.sin(thigh), drop - L * Math.cos(thigh));
      jointFrame(bones, leg, 0, ankleX, 0, 0, -thigh, -twist, hipRoll);
      jointFrame(bones, leg + 1, leg, 0, -L, 0, thigh - shin);
      jointFrame(bones, leg + 2, leg + 1, 0, -S, 0, shin + footPitch);
      const arm = 9 + k * 3,
        armSwing = s * Math.cos(phase) * gait;
      jointFrame(
        bones,
        arm,
        1,
        s * 0.245,
        0.567,
        0,
        celebrate ? -2.56 : 0.09 + armSwing * 0.69 + s * load * 0.4 - s * swing * 0.47,
        s * 0.08,
        s * (celebrate ? 0.38 : 0.13 + 0.2 * hold + 0.26 * fake)
      );
      jointFrame(bones, arm + 1, arm, 0, -0.296, 0, -0.25 - gait * 0.76 - 0.28 * hold);
      jointFrame(bones, arm + 2, arm + 1, 0, -0.258, 0, 0.08, s * 0.1);
    }
  }
  function captureRigs(rigs, t, celebratingTeam) {
    for (const p of players) poseAthlete(p, rigs[p.i], t, p.team === celebratingTeam);
    for (const k of keepers) rigs[4 + k.team].set(k.bones);
  }
  function submitKit(kit) {
    const bones = kit.bones;
    if (gl) {
      posedActors.push(kit);
      return;
    }
    const d = kit.data;
    for (let i = 0; i < d.length; i += 10) {
      const j = d[i + 9] * 16,
        X = d[i],
        Y = d[i + 1],
        Z = d[i + 2];
      const normal = [0, 1, 2].map(
        (k) => bones[j + k] * d[i + 6] + bones[j + 4 + k] * d[i + 7] + bones[j + 8 + k] * d[i + 8]
      );
      const light = 0.74 + 0.32 * Math.max(0, dot(normal, sun));
      for (let k = 0; k < 3; k++)
        mesh.push(bones[j + k] * X + bones[j + 4 + k] * Y + bones[j + 8 + k] * Z + bones[j + 12 + k]);
      mesh.push(d[i + 3] * light, d[i + 4] * light, d[i + 5] * light);
    }
  }
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: true,
    powerPreference: "high-performance"
  });
  const soft = gl ? null : canvas.getContext("2d");
  let camera = [-2, 9, 15],
    look = [0, 0.5, 0],
    lastTime = 0,
    wasReplay = false,
    wasMenu = true,
    wasPortrait = portraitPitch.matches;
  let program, staticBuffer, actorBuffer, uniforms;
  function upload() {
    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      return s;
    }
    program = gl.createProgram();
    gl.attachShader(
      program,
      shader(
        gl.VERTEX_SHADER,
        `
      attribute vec3 vertex,tint,normal;
      attribute float joint;
      uniform mat4 bones[15];
      uniform float rigged;
      uniform vec3 eye,rightAxis,upAxis,forwardAxis;
      uniform vec3 origin;
      uniform vec2 lens,turn;
      varying vec3 shade;
      void main(){vec3 point=vertex;float light=1.;
        if(rigged>.5){mat4 jointMatrix=bones[int(joint)];point=(jointMatrix*vec4(vertex,1.)).xyz;
          vec3 n=normalize(mat3(jointMatrix)*normal);light=.70+.37*max(0.,dot(n,normalize(vec3(-.5,.9,.65))))+.05*max(0.,n.y);}
        vec3 p=origin+vec3(point.x*turn.x+point.z*turn.y,point.y,point.z*turn.x-point.x*turn.y)-eye;float d=dot(p,forwardAxis);
        gl_Position=vec4(dot(p,rightAxis)*lens.x,dot(p,upAxis)*lens.y,1.001*d-.2,d);
        shade=mix(tint*light,vec3(.84,.66,.62),smoothstep(24.,85.,d)*.63);}`
      )
    );
    gl.attachShader(
      program,
      shader(
        gl.FRAGMENT_SHADER,
        "precision mediump float; varying vec3 shade; void main(){gl_FragColor=vec4(shade,1.);}"
      )
    );
    gl.bindAttribLocation(program, 0, "vertex");
    gl.bindAttribLocation(program, 1, "tint");
    gl.bindAttribLocation(program, 2, "normal");
    gl.bindAttribLocation(program, 3, "joint");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    uniforms = Object.fromEntries(
      ["eye", "rightAxis", "upAxis", "forwardAxis", "lens", "origin", "turn", "bones[0]", "rigged"].map(
        (n) => [n, gl.getUniformLocation(program, n)]
      )
    );
    for (const kit of kits) {
      kit.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, kit.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, kit.data, gl.STATIC_DRAW);
    }
    staticBuffer = gl.createBuffer();
    actorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, staticBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, staticMesh, gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.clearColor(0, 0, 0, 0);
  }
  if (gl) {
    upload();
    canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextrestored", upload);
  }
  function drawBuffer(buf, count) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, count / 6);
  }
  function softwareDraw(arrays, right, up, forward, f, aspect) {
    const backdrop = [],
      turf = [],
      upright = [];
    for (const arr of arrays)
      for (let i = 0; i < arr.length; i += 18) {
        const pts = [];
        let depth = 0;
        for (let j = i; j < i + 18; j += 6) {
          const d = [arr[j] - camera[0], arr[j + 1] - camera[1], arr[j + 2] - camera[2]],
            z = dot(d, forward);
          if (z < 0.12) break;
          pts.push([
            ((1 + (dot(d, right) * f) / (aspect * z)) * canvas.width) / 2,
            ((1 - (dot(d, up) * f) / z) * canvas.height) / 2
          ]);
          depth += z;
        }
        if (
          pts.length !== 3 ||
          pts.every((p) => p[0] < 0) ||
          pts.every((p) => p[0] > canvas.width) ||
          pts.every((p) => p[1] < 0) ||
          pts.every((p) => p[1] > canvas.height)
        )
          continue;
        // A long pitch triangle can have a nearer centroid than a keeper standing on it.
        let layer = upright;
        if (arr === staticMesh) {
          if (i < turfStart) layer = backdrop;
          else if (i < fixturesStart) layer = turf;
        } else if (arr[i + 1] === arr[i + 7] && arr[i + 1] === arr[i + 13] && arr[i + 1] <= 0.066)
          layer = turf;
        layer.push([
          depth,
          pts,
          "rgb(" + [3, 4, 5].map((j) => Math.round(arr[i + j] * 255)).join(",") + ")"
        ]);
      }
    soft.clearRect(0, 0, canvas.width, canvas.height);
    backdrop.sort((a, b) => b[0] - a[0]);
    upright.sort((a, b) => b[0] - a[0]);
    for (const layer of [backdrop, turf, upright])
      for (const [, p, c] of layer) {
        soft.fillStyle = c;
        soft.beginPath();
        soft.moveTo(...p[0]);
        soft.lineTo(...p[1]);
        soft.lineTo(...p[2]);
        soft.fill();
      }
  }
  function draw(state, time) {
    const { players, active, mode, charging, charge } = state,
      menu = mode === "menu",
      reel = state.replay;
    const ball = reel ? reel.ball : state.ball;
    const t = time / 1000,
      dt = Math.min(0.12, Math.max(0, t - lastTime));
    lastTime = t;
    const width = canvas.clientWidth || 960,
      height = canvas.clientHeight || 540,
      aspect = width / height,
      portrait = portraitPitch.matches;
    const pixelRatioLimit = touchLayout.matches ? Math.sqrt(1050000 / (width * height)) : 1.65;
    const ratio = Math.min(window.devicePixelRatio || 1, gl ? 1.65 : 1, pixelRatioLimit);
    const rw = Math.round(width * ratio),
      rh = Math.round(height * ratio);
    if (canvas.width !== rw || canvas.height !== rh) {
      canvas.width = rw;
      canvas.height = rh;
    }
    const bx = worldX(ball.x),
      bz = worldZ(ball.y),
      px = worldX(players[active].x),
      pz = worldZ(players[active].y),
      focus = bx * 0.66 + px * 0.34;
    let target, eye;
    if (reel) {
      const sign = reel.goalSign,
        end = 20 * sign,
        wide = Math.min(1, Math.abs(end - bx) / 16),
        zoom = aspect < 1.42 ? 1.18 : 1;
      target = [bx + (end - bx) * 0.19, 0.84 + 0.22 * ball.height * 0.04, bz * 0.8];
      if (reel.kind === "goal") {
        eye = [
          target[0] - sign * (4.2 + 2 * wide) * zoom,
          (3.6 + 2 * wide) * zoom,
          Math.max(-10.8, target[2] - (7.2 + 2 * wide) * zoom)
        ];
      } else {
        eye = [
          target[0] - sign * (7.3 + 2 * wide) * zoom,
          (2.8 + 1.8 * wide) * zoom,
          target[2] + (5.4 + 2 * wide) * zoom
        ];
      }
    } else if (menu) {
      const sway = reducedMotion.matches ? 0 : Math.sin(t * 0.14) * 0.4;
      target = [-1.8, 1.1, -0.8];
      eye = [4.5 + sway, 3.2, 8.4 + sway];
    } else if (portrait) {
      // Look along the length of the pitch so the player and the attacking goal share the narrow screen.
      const X = clamp(focus, -19, 18),
        Z = bz * 0.82 + pz * 0.18;
      target = [Math.min(X + 4.2, 21), 0.55, Z * 0.83 - 0.6];
      eye = [X - 10.4, 11.2, Z - 3.8];
    } else {
      const X = Math.max(-15, Math.min(15, focus)),
        Z = (bz * 0.66 + pz * 0.34) * 0.67;
      const zoom = aspect < 1.2 ? 1.24 : 1;
      target = [X, 0.55, Z - 0.55];
      eye = [X - 2.1, 9.3 * zoom, 14.4 * zoom + Z];
    }
    const ease =
      menu || wasMenu || reel || wasReplay || portrait !== wasPortrait ? 1 : 1 - Math.exp(-dt * 5.5);
    camera = mix(camera, eye, ease);
    look = mix(look, target, ease);
    wasReplay = !!reel;
    wasMenu = menu;
    wasPortrait = portrait;
    const forward = unit(v(look, camera)),
      right = unit(cross(forward, [0, 1, 0])),
      up = cross(right, forward),
      f = 1 / Math.tan(((menu ? 46 : reel ? 49 : 54) * Math.PI) / 360);
    mesh = [];
    posedActors.length = 0;
    for (let i = 0; i < kits.length; i++) {
      const kit = kits[i],
        bones = kit.bones,
        keeper = i >= players.length;
      if (reel) {
        const a = reel.a.rigs[i],
          b = reel.b.rigs[i];
        for (let j = 0; j < bones.length; j++) bones[j] = a[j] + (b[j] - a[j]) * reel.blend;
      } else if (keeper) bones.set(keepers[i - players.length].bones);
      else
        poseAthlete(
          players[i],
          bones,
          menu ? t : elapsed,
          mode === "goal" && players[i].team === state.scoring
        );
      const x = bones[12],
        z = bones[14];
      if (keeper)
        disk(x, z, 0.37, 0.26 + 0.33 * Math.abs(bones[4]) + 0.33 * Math.abs(bones[6]), "#32776f", 0.015);
      else disk(x + 0.11, z - 0.09, 0.4, 0.22, "#32776f", 0.034);
      if (!reel && !menu && i === active) {
        ring(x, z, 0.55, 0.48, 0.05, "#ffdc68", 0.051, 32);
        pipe([x, 2.35, z], [x, 2.52, z], 0.012, 0.108, "#ffdb62", 4);
      }
      submitKit(kit);
    }
    const h = ball.height || 0;
    disk(bx + 0.06, bz - 0.03, 0.24 / (1 + h * 0.013), 0.17 / (1 + h * 0.013), "#28665f", 0.056);
    football(bx, 0.17 + h * 0.04, bz, ball.rotation);
    if (charging && !reel) {
      const path = shotPreview(),
        color = Math.abs(bend) > 0.08 ? "#a8ffdf" : "#ffe07b";
      for (let i = 1; i < path.length; i += 2) {
        const a = path[i - 1],
          b = path[i],
          y = 0.17 + a.height * 0.04,
          Y = 0.17 + b.height * 0.04;
        const x = worldX(a.x),
          z = worldZ(a.y),
          X = worldX(b.x),
          Z = worldZ(b.y);
        quad([x, y - 0.027, z], [x, y + 0.027, z], [X, Y + 0.027, Z], [X, Y - 0.027, Z], color, 1);
        stripe(x, z, X, Z, 0.045, "#b6c6a4", 0.064);
      }
      ring(px, pz, 0.68, 0.65, 0.04 + 0.09 * charge, "#ffbc4e", 0.065, 32);
    }
    const actors = new Float32Array(mesh);
    if (gl) {
      if (gl.isContextLost()) return;
      gl.viewport(0, 0, rw, rh);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(uniforms.eye, camera);
      gl.uniform3fv(uniforms.rightAxis, right);
      gl.uniform3fv(uniforms.upAxis, up);
      gl.uniform3fv(uniforms.forwardAxis, forward);
      gl.uniform2f(uniforms.lens, f / aspect, f);
      gl.uniform1f(uniforms.rigged, 0);
      gl.uniform3f(uniforms.origin, 0, 0, 0);
      gl.uniform2f(uniforms.turn, 1, 0);
      drawBuffer(staticBuffer, staticMesh.length);
      gl.bindBuffer(gl.ARRAY_BUFFER, actorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, actors, gl.DYNAMIC_DRAW);
      drawBuffer(actorBuffer, actors.length);
      gl.uniform1f(uniforms.rigged, 1);
      gl.enableVertexAttribArray(2);
      gl.enableVertexAttribArray(3);
      for (const kit of posedActors) {
        gl.uniformMatrix4fv(uniforms["bones[0]"], false, kit.bones);
        gl.bindBuffer(gl.ARRAY_BUFFER, kit.buffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
        gl.drawArrays(gl.TRIANGLES, 0, kit.data.length / 10);
      }
      gl.disableVertexAttribArray(2);
      gl.disableVertexAttribArray(3);
    } else softwareDraw([staticMesh, actors], right, up, forward, f, aspect);
  }
  return { draw, captureRigs, groundKeeper, accelerated: !!gl };
}
