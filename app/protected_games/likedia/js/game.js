/**
 * diaLike - Game Controller
 * Orchestrates Camera, Map, Player, Monsters, Audio, and the main loop.
 *
 * Dependencies: sound.js (SoundEngine), data.js (game constants & data)
 */
// ==========================================
// 1. CAMERA ENGINE
// ==========================================
// WorldViewSystem (Global reference to the utility class)
// The geometry logic has been moved entirely to this system for clean separation of concerns.

class Camera {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
        this.lerpFactor = 0.08;
    }

    update(targetX, targetY) {
        this.x += (targetX - this.x) * this.lerpFactor;
        this.y += (targetY - this.y) * this.lerpFactor;
    }

    getIsoOffset() {
        // Use the centralized WorldViewSystem for geometry calculation
        return WorldViewSystem.worldToIso(this.x, this.y);
    }
}

// ==========================================
// 2. ISOMETRIC TILE MAP ENGINE
// ==========================================
class TileMap {
    constructor(tileSize = 64, type = 'dungeon', floor = 1) {
        this.tileSize = tileSize;
        this.type = type;
        this.floor = floor;
        this.cols = type === 'town' ? 16 : 40;
        this.rows = type === 'town' ? 16 : 40;

        // Deeper floors shift the palette: brown -> blue-grey -> infernal red
        const tier = type === 'town' ? 0 : Math.min(2, Math.floor((floor - 1) / 3));
        this.palette = TileMap.PALETTES[type === 'town' ? 'town' : `dungeon${tier}`];

        // Dungeon floors use the stone sprite as a base; town floors are
        // fully procedural (no grass asset exists in /assets).
        this.tileImage = null;
        this.isImageLoaded = false;
        this.tileVariants = this.buildTileVariants(null);
        if (type === 'dungeon') {
            this.tileImage = new Image();
            this.tileImage.src = 'assets/tile_stone.png';
            this.tileImage.onload = () => {
                this.isImageLoaded = true;
                this.tileVariants = this.buildTileVariants(this.tileImage);
            };
        }

        this.grid = [];
        this.variantGrid = [];
        this.rooms = [];          // dungeon rooms as {r, c, w, h}
        this.houseSpots = [];     // town building footprints
        this.spawnPoint = null;   // world coords
        this.stairsPoint = null;
        this.bossPoint = null;
        this.generateMap();

        // Fog-of-war state for the minimap (town starts fully revealed)
        this.explored = [];
        for (let r = 0; r < this.rows; r++) {
            this.explored.push(new Array(this.cols).fill(type === 'town'));
        }
    }

    tileToWorld(c, r) {
        return WorldViewSystem.tileToWorld(c, r, this.tileSize);
    }

    // Deterministic per-cell hash so tile decoration stays stable every frame
    static cellHash(r, c) {
        let h = (r * 73856093) ^ (c * 19349663);
        h = (h ^ (h >> 13)) * 1274126177;
        return Math.abs(h ^ (h >> 16));
    }

    buildTileVariants(baseImage) {
        const w = this.tileSize * 2;
        const h = this.tileSize;
        const isTown = this.type === 'town';
        const baseTones = this.palette.base;
        const variants = [];

        for (let v = 0; v < 8; v++) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const tctx = canvas.getContext('2d');

            let seed = v * 7919 + (isTown ? 131 : 17);
            const rnd = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };

            tctx.beginPath();
            tctx.moveTo(w / 2, 0);
            tctx.lineTo(w, h / 2);
            tctx.lineTo(w / 2, h);
            tctx.lineTo(0, h / 2);
            tctx.closePath();
            tctx.clip();

            if (baseImage) {
                tctx.drawImage(baseImage, 0, 0, w, h);
                tctx.fillStyle = `rgba(15, 10, 5, ${(v % 4) * 0.07})`;
                tctx.fillRect(0, 0, w, h);
            } else {
                tctx.fillStyle = baseTones.at(v % baseTones.length);
                tctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 5; i++) {
                    tctx.fillStyle = `rgba(${isTown ? '60, 110, 50' : '70, 58, 44'}, ${0.05 + rnd() * 0.08})`;
                    tctx.beginPath();
                    tctx.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 16, 4 + rnd() * 8, 0, 0, Math.PI * 2);
                    tctx.fill();
                }
            }

            // Speckle noise
            for (let i = 0; i < 24; i++) {
                tctx.fillStyle = isTown
                    ? `rgba(${50 + Math.floor(rnd() * 50)}, ${100 + Math.floor(rnd() * 70)}, ${40 + Math.floor(rnd() * 40)}, 0.25)`
                    : `rgba(${60 + Math.floor(rnd() * 50)}, ${50 + Math.floor(rnd() * 40)}, ${40 + Math.floor(rnd() * 30)}, 0.2)`;
                tctx.fillRect(rnd() * w, rnd() * h, 1.5 + rnd() * 2.5, 1 + rnd() * 1.5);
            }

            if (v === 4) {
                if (isTown) {
                    // worn dirt path patch
                    tctx.fillStyle = 'rgba(92, 70, 40, 0.4)';
                    tctx.beginPath();
                    tctx.ellipse(w / 2 + (rnd() - 0.5) * 20, h / 2 + (rnd() - 0.5) * 8, 18 + rnd() * 8, 8 + rnd() * 4, 0, 0, Math.PI * 2);
                    tctx.fill();
                } else {
                    // floor cracks
                    tctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                    tctx.lineWidth = 1;
                    tctx.beginPath();
                    let cx = w * 0.35 + rnd() * w * 0.2;
                    let cy = h * 0.25;
                    tctx.moveTo(cx, cy);
                    for (let i = 0; i < 4; i++) {
                        cx += (rnd() - 0.35) * 20;
                        cy += 4 + rnd() * 8;
                        tctx.lineTo(cx, cy);
                    }
                    tctx.stroke();
                }
            } else if (v === 5) {
                if (isTown) {
                    // grass tufts
                    tctx.strokeStyle = 'rgba(90, 160, 70, 0.8)';
                    tctx.lineWidth = 1;
                    for (let i = 0; i < 6; i++) {
                        const gx = w * 0.25 + rnd() * w * 0.5;
                        const gy = h * 0.3 + rnd() * h * 0.4;
                        tctx.beginPath();
                        tctx.moveTo(gx, gy);
                        tctx.lineTo(gx + (rnd() - 0.5) * 4, gy - 4 - rnd() * 4);
                        tctx.stroke();
                    }
                } else {
                    // scattered pebbles
                    tctx.fillStyle = 'rgba(110, 100, 90, 0.6)';
                    for (let i = 0; i < 5; i++) {
                        tctx.beginPath();
                        tctx.ellipse(w * 0.25 + rnd() * w * 0.5, h * 0.3 + rnd() * h * 0.4, 1.5 + rnd() * 2, 1 + rnd() * 1.5, 0, 0, Math.PI * 2);
                        tctx.fill();
                    }
                }
            } else if (v === 6) {
                if (isTown) {
                    // wild flowers
                    const flowerColors = ['#e8d44d', '#d977c0', '#f0f0f0'];
                    for (let i = 0; i < 3; i++) {
                        const fx = w * 0.3 + rnd() * w * 0.4;
                        const fy = h * 0.3 + rnd() * h * 0.4;
                        tctx.strokeStyle = 'rgba(70, 130, 60, 0.9)';
                        tctx.beginPath();
                        tctx.moveTo(fx, fy + 3);
                        tctx.lineTo(fx, fy);
                        tctx.stroke();
                        tctx.fillStyle = flowerColors.at(Math.floor(rnd() * flowerColors.length));
                        tctx.beginPath();
                        tctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
                        tctx.fill();
                    }
                } else {
                    // old bones
                    tctx.fillStyle = 'rgba(190, 185, 170, 0.75)';
                    const bx = w * 0.4 + rnd() * w * 0.2;
                    const by = h * 0.4 + rnd() * h * 0.2;
                    tctx.fillRect(bx, by, 9, 2);
                    tctx.fillRect(bx + 7, by - 3, 2, 8);
                    tctx.beginPath();
                    tctx.arc(bx - 2, by + 1, 2.5, 0, Math.PI * 2);
                    tctx.fill();
                }
            } else if (v === 7) {
                if (isTown) {
                    // clover patch
                    tctx.fillStyle = 'rgba(60, 140, 60, 0.45)';
                    for (let i = 0; i < 8; i++) {
                        tctx.beginPath();
                        tctx.arc(w * 0.3 + rnd() * w * 0.4, h * 0.3 + rnd() * h * 0.4, 1.5 + rnd(), 0, Math.PI * 2);
                        tctx.fill();
                    }
                } else {
                    // moss growth
                    tctx.fillStyle = 'rgba(50, 90, 45, 0.35)';
                    for (let i = 0; i < 4; i++) {
                        tctx.beginPath();
                        tctx.ellipse(w * 0.3 + rnd() * w * 0.4, h * 0.3 + rnd() * h * 0.4, 4 + rnd() * 6, 2 + rnd() * 3, 0, 0, Math.PI * 2);
                        tctx.fill();
                    }
                }
            }

            // Depth-tier color wash unifies image, speckles and decorations
            if (this.palette.tint) {
                tctx.fillStyle = this.palette.tint;
                tctx.fillRect(0, 0, w, h);
            }

            // subtle edge shading for tile separation
            tctx.strokeStyle = isTown ? 'rgba(10, 25, 10, 0.35)' : 'rgba(0, 0, 0, 0.3)';
            tctx.lineWidth = 1;
            tctx.beginPath();
            tctx.moveTo(w / 2, 0.5);
            tctx.lineTo(w - 0.5, h / 2);
            tctx.lineTo(w / 2, h - 0.5);
            tctx.lineTo(0.5, h / 2);
            tctx.closePath();
            tctx.stroke();

            variants.push(canvas);
        }
        return variants;
    }

    generateMap() {
        if (this.type === 'town') {
            this.generateTown();
        } else {
            this.generateDungeon();
        }
        this.buildVariantGrid();
    }

    buildVariantGrid() {
        this.variantGrid = [];
        for (let r = 0; r < this.rows; r++) {
            const variantRow = [];
            for (let c = 0; c < this.cols; c++) {
                // Mostly plain tone variants, occasionally a decorated tile
                const hash = TileMap.cellHash(r, c);
                let variant = hash % 4;
                const decoRoll = hash % 23;
                if (decoRoll === 7) variant = 4;
                else if (decoRoll === 11) variant = 5;
                else if (decoRoll === 15) variant = 6;
                else if (decoRoll === 19) variant = 7;
                variantRow.push(variant);
            }
            this.variantGrid.push(variantRow);
        }
    }

    generateTown() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            const rowData = [];
            for (let c = 0; c < this.cols; c++) {
                rowData.push(r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1 ? 1 : 0);
            }
            this.grid.push(rowData);
        }

        // Building footprints are solid so the player can't walk through them;
        // the house prop is drawn on top of the resulting wall blocks
        this.houseSpots = [
            { r: 2, c: 3, w: 2, h: 2 },
            { r: 2, c: 11, w: 2, h: 2 }
        ];
        this.houseSpots.forEach(spot => {
            for (let r = spot.r; r < spot.r + spot.h; r++) {
                for (let c = spot.c; c < spot.c + spot.w; c++) {
                    this.grid[r][c] = 1;
                }
            }
        });
    }

    // Classic rooms-and-corridors dungeon: place non-overlapping rooms,
    // then link consecutive room centers with 2-tile-wide L corridors.
    generateDungeon() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid.push(new Array(this.cols).fill(1));
        }

        this.rooms = [];
        let attempts = 0;
        while (this.rooms.length < 8 && attempts < 80) {
            attempts++;
            const w = 4 + Math.floor(Math.random() * 4);
            const h = 4 + Math.floor(Math.random() * 4);
            const c = 2 + Math.floor(Math.random() * (this.cols - w - 4));
            const r = 2 + Math.floor(Math.random() * (this.rows - h - 4));

            const overlaps = this.rooms.some(other =>
                c - 1 < other.c + other.w + 1 && c + w + 1 > other.c - 1 &&
                r - 1 < other.r + other.h + 1 && r + h + 1 > other.r - 1
            );
            if (overlaps) continue;

            this.rooms.push({ r, c, w, h });
            for (let rr = r; rr < r + h; rr++) {
                for (let cc = c; cc < c + w; cc++) {
                    this.grid[rr][cc] = 0;
                }
            }
        }

        // Failsafe: pathological RNG produced no layout — fall back to one big hall
        if (this.rooms.length < 2) {
            for (let r = 2; r < this.rows - 2; r++) {
                for (let c = 2; c < this.cols - 2; c++) {
                    this.grid[r][c] = 0;
                }
            }
            this.rooms = [{ r: 2, c: 2, w: this.cols - 4, h: this.rows - 4 }];
        }

        const center = room => ({
            c: room.c + Math.floor(room.w / 2),
            r: room.r + Math.floor(room.h / 2)
        });

        for (let i = 1; i < this.rooms.length; i++) {
            const a = center(this.rooms[i - 1]);
            const b = center(this.rooms[i]);
            if (Math.random() < 0.5) {
                this.carveCorridor(a.c, b.c, a.r, true);
                this.carveCorridor(a.r, b.r, b.c, false);
            } else {
                this.carveCorridor(a.r, b.r, a.c, false);
                this.carveCorridor(a.c, b.c, b.r, true);
            }
        }

        // Spawn in the first room; stairs in the room farthest from spawn;
        // boss in the largest room (preferring one that isn't the spawn room)
        const spawn = center(this.rooms[0]);
        this.spawnPoint = this.tileToWorld(spawn.c, spawn.r);

        let farthest = this.rooms[0];
        let bestDist = -1;
        this.rooms.forEach(room => {
            const cc = center(room);
            const d = Math.hypot(cc.c - spawn.c, cc.r - spawn.r);
            if (d > bestDist) {
                bestDist = d;
                farthest = room;
            }
        });
        const stairsTile = center(farthest);
        this.stairsPoint = this.tileToWorld(stairsTile.c, stairsTile.r);

        const candidates = this.rooms.length > 1 ? this.rooms.slice(1) : this.rooms;
        let largest = candidates[0];
        candidates.forEach(room => {
            if (room.w * room.h > largest.w * largest.h) largest = room;
        });
        const bossTile = center(largest);
        this.bossPoint = this.tileToWorld(bossTile.c, bossTile.r);
    }

    // Carves a 2-wide straight corridor along one axis at a fixed cross position
    carveCorridor(from, to, fixed, horizontal) {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        for (let i = lo; i <= hi; i++) {
            for (let off = 0; off < 2; off++) {
                const r = horizontal ? fixed + off : i;
                const c = horizontal ? i : fixed + off;
                if (r >= 1 && r < this.rows - 1 && c >= 1 && c < this.cols - 1) {
                    this.grid[r][c] = 0;
                }
            }
        }
    }

    worldToIso(x, y) {
        return WorldViewSystem.worldToIso(x, y);
    }

    isoToWorld(isoX, isoY) {
        return WorldViewSystem.isoToWorld(isoX, isoY);
    }

    isSolid(x, y) {
        const c = Math.floor(x / this.tileSize);
        const r = Math.floor(y / this.tileSize);
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) {
            return true;
        }
        return this.grid[r][c] === 1;
    }

    // A* over tiles (8-direction, diagonals can't cut wall corners).
    // Returns tile-center world waypoints excluding the start tile,
    // or null when the destination is unreachable.
    findPath(startX, startY, endX, endY) {
        const ts = this.tileSize;
        const sc = Math.floor(startX / ts);
        const sr = Math.floor(startY / ts);
        const ec = Math.floor(endX / ts);
        const er = Math.floor(endY / ts);
        if (sr < 0 || sr >= this.rows || sc < 0 || sc >= this.cols) return null;
        if (er < 0 || er >= this.rows || ec < 0 || ec >= this.cols) return null;
        if (this.grid[er][ec] === 1) return null;
        if (sr === er && sc === ec) return [];

        const idx = (r, c) => r * this.cols + c;
        const startIdx = idx(sr, sc);
        const gScore = new Float64Array(this.rows * this.cols).fill(Infinity);
        const cameFrom = new Int32Array(this.rows * this.cols).fill(-1);
        const closed = new Uint8Array(this.rows * this.cols);
        const open = [{ r: sr, c: sc, f: 0 }];
        gScore[startIdx] = 0;

        const DIRS = [
            [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
            [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2],
            [1, -1, Math.SQRT2], [1, 1, Math.SQRT2]
        ];

        let iterations = 0;
        const maxIterations = this.rows * this.cols;
        while (open.length > 0 && iterations++ < maxIterations) {
            // grid is small, so a linear scan for the lowest f is fine
            let best = 0;
            for (let i = 1; i < open.length; i++) {
                if (open[i].f < open[best].f) best = i;
            }
            const cur = open.splice(best, 1)[0];
            const ci = idx(cur.r, cur.c);
            if (closed[ci]) continue;
            closed[ci] = 1;

            if (cur.r === er && cur.c === ec) {
                const path = [];
                let walk = ci;
                while (walk !== -1 && walk !== startIdx) {
                    const wr = Math.floor(walk / this.cols);
                    const wc = walk % this.cols;
                    path.push(this.tileToWorld(wc, wr));
                    walk = cameFrom[walk];
                }
                return path.reverse();
            }

            for (const [dr, dc, cost] of DIRS) {
                const nr = cur.r + dr;
                const nc = cur.c + dc;
                if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
                if (this.grid[nr][nc] === 1) continue;
                if (dr !== 0 && dc !== 0 &&
                    (this.grid[cur.r + dr][cur.c] === 1 || this.grid[cur.r][cur.c + dc] === 1)) {
                    continue;
                }
                const ni = idx(nr, nc);
                if (closed[ni]) continue;
                const g = gScore[ci] + cost;
                if (g < gScore[ni]) {
                    gScore[ni] = g;
                    cameFrom[ni] = ci;
                    open.push({ r: nr, c: nc, f: g + Math.hypot(nr - er, nc - ec) });
                }
            }
        }
        return null;
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tileType = this.grid.at(r).at(c);
                const cartX = c * this.tileSize + this.tileSize / 2;
                const cartY = r * this.tileSize + this.tileSize / 2;

                const isoPos = WorldViewSystem.worldToIso(cartX, cartY);
                const screenX = isoPos.x - isoCam.x + halfWidth;
                const screenY = isoPos.y - isoCam.y + halfHeight;

                const buffer = 150;
                if (screenX < -buffer || screenX > viewWidth + buffer || 
                    screenY < -buffer || screenY > viewHeight + buffer) {
                    continue;
                }

                if (tileType === 0) {
                    const variantIdx = this.variantGrid.at(r).at(c);
                    const tileCanvas = this.tileVariants ? this.tileVariants.at(variantIdx) : null;
                    if (tileCanvas) {
                        const imgWidth = this.tileSize * 2;
                        const imgHeight = this.tileSize;
                        ctx.drawImage(
                            tileCanvas,
                            screenX - imgWidth / 2,
                            screenY - imgHeight / 2,
                            imgWidth,
                            imgHeight
                        );
                    } else {
                        ctx.fillStyle = this.palette.fallbackFloor;
                        ctx.strokeStyle = this.palette.fallbackStroke;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(screenX, screenY - this.tileSize / 2);
                        ctx.lineTo(screenX + this.tileSize, screenY);
                        ctx.lineTo(screenX, screenY + this.tileSize / 2);
                        ctx.lineTo(screenX - this.tileSize, screenY);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                }
                // Walls (tileType 1) are depth-sorted with entities and drawn
                // via renderWallTile so they can occlude or fade around actors
            }
        }
    }

    renderWallTile(ctx, screenX, screenY, r, c, alpha = 1) {
        const heightOffset = 40;
        const w = this.tileSize;
        const hash = TileMap.cellHash(r, c);
        const pal = this.palette;

        ctx.save();
        if (alpha < 1) ctx.globalAlpha = alpha;

        ctx.fillStyle = pal.wallTop.at(hash % 3);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - w / 2 - heightOffset);
        ctx.lineTo(screenX + w, screenY - heightOffset);
        ctx.lineTo(screenX, screenY + w / 2 - heightOffset);
        ctx.lineTo(screenX - w, screenY - heightOffset);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = pal.wallLeft;
        ctx.beginPath();
        ctx.moveTo(screenX - w, screenY - heightOffset);
        ctx.lineTo(screenX, screenY + w / 2 - heightOffset);
        ctx.lineTo(screenX, screenY + w / 2);
        ctx.lineTo(screenX - w, screenY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = pal.wallRight;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY + w / 2 - heightOffset);
        ctx.lineTo(screenX + w, screenY - heightOffset);
        ctx.lineTo(screenX + w, screenY);
        ctx.lineTo(screenX, screenY + w / 2);
        ctx.closePath();
        ctx.fill();

        // Mortar lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k <= 2; k++) {
            const dy = (heightOffset / 3) * k + (hash % 5) - 2;
            ctx.moveTo(screenX - w, screenY - heightOffset + dy);
            ctx.lineTo(screenX, screenY + w / 2 - heightOffset + dy);
            ctx.moveTo(screenX, screenY + w / 2 - heightOffset + dy);
            ctx.lineTo(screenX + w, screenY - heightOffset + dy);
        }
        const seamL = 0.25 + (hash % 7) * 0.07;
        ctx.moveTo(screenX - w + w * seamL, screenY - heightOffset + (w / 2) * seamL);
        ctx.lineTo(screenX - w + w * seamL, screenY - heightOffset + (w / 2) * seamL + heightOffset);
        const seamR = 0.25 + (hash % 5) * 0.09;
        ctx.moveTo(screenX + w * seamR, screenY + w / 2 - heightOffset - (w / 2) * seamR);
        ctx.lineTo(screenX + w * seamR, screenY + w / 2 - heightOffset - (w / 2) * seamR + heightOffset);
        ctx.stroke();

        ctx.strokeStyle = pal.wallStroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY + w / 2 - heightOffset);
        ctx.lineTo(screenX + w, screenY - heightOffset);
        ctx.lineTo(screenX + w, screenY);
        ctx.lineTo(screenX, screenY + w / 2);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }
}

// Floor-depth palettes: tiers 0-2 cover floors 1-3, 4-6, 7+
TileMap.PALETTES = {
    town: {
        base: ['#1d3a1d', '#1a331a', '#214221', '#183018'],
        tint: null,
        wallTop: ['#223b22', '#1f3a26', '#264226'],
        wallLeft: '#172b17',
        wallRight: '#0f1f0f',
        wallStroke: '#325232',
        fallbackFloor: '#152515',
        fallbackStroke: '#223822'
    },
    dungeon0: {
        base: ['#262019', '#221c16', '#2a231b', '#1f1a14'],
        tint: null,
        wallTop: ['#2d241e', '#332a22', '#2a2520'],
        wallLeft: '#1e1814',
        wallRight: '#15100d',
        wallStroke: '#4a3b30',
        fallbackFloor: '#1c1712',
        fallbackStroke: '#2b2118'
    },
    dungeon1: {
        base: ['#1b212b', '#171c25', '#1e2530', '#141a22'],
        tint: 'rgba(50, 80, 140, 0.16)',
        wallTop: ['#28303e', '#2d3645', '#242c39'],
        wallLeft: '#1a212c',
        wallRight: '#11161e',
        wallStroke: '#46546c',
        fallbackFloor: '#161b23',
        fallbackStroke: '#242d3a'
    },
    dungeon2: {
        base: ['#2b1a15', '#251511', '#321e17', '#1f110d'],
        tint: 'rgba(160, 40, 10, 0.14)',
        wallTop: ['#3c2620', '#442c24', '#36221c'],
        wallLeft: '#26160f',
        wallRight: '#1a0e09',
        wallStroke: '#6a4030',
        fallbackFloor: '#221410',
        fallbackStroke: '#35201a'
    }
};

// ==========================================
// 3. PLAYER HERO ENGINE
// ==========================================
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.radius = 16;
        this.speed = 3.5;

        // Base values
        this.level = 1;
        this.hp = 100;
        this.maxHp = 100;
        this.mp = 50;
        this.maxMp = 50;
        this.atk = 15;

        this.baseAtk = 15;
        this.baseMaxHp = 100;
        this.baseMaxMp = 50;

        this.exp = 0;
        this.nextExp = 100;
        this.statPoints = 0;
        this.skillPoints = 0;
        // skills maps skillKey -> level (>=1 means learned). skillAccess lists
        // which skills this character may learn (a class overrides it later).
        this.skills = { fireball: 1 };
        this.skillAccess = ['fireball', 'frostbolt', 'chain', 'whirlwind'];
        this.activeSkill = 'fireball'; // bound to right-click / '>'
        this.fireballBonus = 0;
        // Belt potions store heal percentages (of max HP/MP) so healing
        // keeps pace with level scaling
        this.potions = [35, 35, 35, 35, 35];
        this.manaPotions = [50, 50];
        this.gold = 100;
        this.kills = 0;

        this.state = 'idle';
        this.direction = 0;
        this.path = []; // queued A* waypoints after the current target
        this.movement = null; // assigned by GameController: PlayerMovementSystem

        this.animTimer = 0;
        this.animSpeed = 0.15;
        // Sheets in /assets ship with pre-keyed transparent backgrounds,
        // so they can be drawn directly (works on file:// as well).
        this.spriteSheet = new Image();
        this.spriteSheet.src = 'assets/hero.png';
        this.processedSheet = null;
        this.isLoaded = false;
        this.spriteSheet.onload = () => {
            this.processedSheet = this.spriteSheet;
            this.isLoaded = true;
        };

        this.attackDuration = 20;
        this.attackTimer = 0;
        this.attackRange = 45;
        this.spellCost = 15;
        this.critChance = 0.05;
        this.critMultiplier = 1.75;
        this.resists = { fire: 0, physical: 0 };
    }

    // Applies a class preset: base stats, skill pool, and starting skill.
    // Called once at run start before the player has gained anything.
    setClass(classKey) {
        const c = CLASSES[classKey];
        if (!c) return;
        this.classKey = classKey;
        this.baseAtk = c.baseAtk;
        this.baseMaxHp = c.baseMaxHp;
        this.baseMaxMp = c.baseMaxMp;
        this.atk = c.baseAtk;
        this.maxHp = c.baseMaxHp;
        this.hp = c.baseMaxHp;
        this.maxMp = c.baseMaxMp;
        this.mp = c.baseMaxMp;
        this.critChance = c.critChance;
        this.critMultiplier = c.critMultiplier;
        this.attackDuration = c.attackDuration;
        this.skillAccess = c.skillAccess.slice();
        this.skills = Object.assign({}, c.startSkill);
        this.activeSkill = c.activeSkill;
    }

    moveTo(tx, ty) {
        if (this.movement) {
            this.movement.moveTo(tx, ty);
        } else {
            if (this.state === 'attack') return;
            this.path = [];
            this.targetX = tx;
            this.targetY = ty;
        }
    }

    setPath(points) {
        if (this.movement) {
            this.movement.setPath(points);
        } else {
            if (this.state === 'attack') return;
            if (!points || points.length === 0) return;
            this.targetX = points[0].x;
            this.targetY = points[0].y;
            this.path = points.slice(1);
        }
    }

    meleeAttack() {
        if (this.state === 'attack') return false;
        this.state = 'attack';
        this.attackTimer = this.attackDuration;
        this.animTimer = 0;
        return true;
    }

    usePotion() {
        if (this.potions.length > 0 && this.hp < this.maxHp) {
            const percent = this.potions.pop();
            const healVal = Math.max(1, Math.floor(this.maxHp * percent / 100));
            this.hp = Math.min(this.maxHp, this.hp + healVal);
            return healVal;
        }
        return 0;
    }

    useManaPotion() {
        if (this.manaPotions.length > 0 && this.mp < this.maxMp) {
            const percent = this.manaPotions.pop();
            const restoreVal = Math.max(1, Math.floor(this.maxMp * percent / 100));
            this.mp = Math.min(this.maxMp, this.mp + restoreVal);
            return restoreVal;
        }
        return 0;
    }

    addStat(statType) {
        if (this.statPoints <= 0) return false;
        this.statPoints--;
        
        if (statType === 'atk') {
            this.baseAtk += 3;
        } else if (statType === 'maxhp') {
            this.baseMaxHp += 35;
            this.hp += 35;
        } else if (statType === 'maxmp') {
            this.baseMaxMp += 10;
            this.mp += 10;
        }
        return true;
    }

    gainExp(amount) {
        this.exp += amount;
        let leveledUp = false;
        
        while (this.exp >= this.nextExp) {
            this.exp -= this.nextExp;
            this.level++;
            this.statPoints += 5;
            this.skillPoints += 1;
            this.baseMaxHp += 15;
            this.baseMaxMp += 10;
            this.hp = this.maxHp;
            this.mp = this.maxMp;
            this.nextExp = Math.floor(this.nextExp * 1.35);
            leveledUp = true;
        }
        return leveledUp;
    }

    recalculateStats(inventory) {
        this.attackDuration = 20; // reset to base; equipped weapon speed re-applies below
        let bonusAtk = 0;
        let bonusHp = 0;
        let bonusMp = 0;
        let skillFireballBonus = 0;

        inventory.forEach(item => {
            if (!item || !item.equipped) return;
            if (item.skillFireballBonus) {
                skillFireballBonus += item.skillFireballBonus;
            }
            if (item.gems) {
                item.gems.forEach(gem => {
                    bonusAtk += gem.effect.atk || 0;
                    bonusHp += gem.effect.hp || 0;
                    bonusMp += gem.effect.mp || 0;
                });
            }
            if (item.affixBonus) {
                if (item.affixBonus.type === 'ATK') bonusAtk += item.affixBonus.value;
                else if (item.affixBonus.type === 'MP') bonusMp += item.affixBonus.value;
                else bonusHp += item.affixBonus.value;
            }
            if (item.type === 'weapon') {
                bonusAtk += item.value;
                if (item.speed) {
                    this.attackDuration = Math.round(20 * item.speed);
                }
            } else if (item.type === 'armor') {
                // primaryStat is set on looted gear; fall back to the stat
                // string for plain templates (e.g. starting items)
                const primary = item.primaryStat || (item.stat.includes('MP') ? 'MP' : 'HP');
                if (primary === 'MP') {
                    bonusMp += item.value;
                } else {
                    bonusHp += item.value;
                }
            }
        });

        this.atk = this.baseAtk + bonusAtk;
        this.maxHp = this.baseMaxHp + bonusHp;
        this.maxMp = this.baseMaxMp + bonusMp;
        this.fireballBonus = skillFireballBonus;

        if (this.hp > this.maxHp) this.hp = this.maxHp;
        if (this.mp > this.maxMp) this.mp = this.maxMp;
    }

    addSkillPoint(skillKey) {
        if (this.skillPoints <= 0) return false;
        if (!this.skillAccess.includes(skillKey)) return false;
        const lvl = this.skills[skillKey] || 0; // 0 means not yet learned
        if (lvl >= SKILLS[skillKey].maxLevel) return false;
        this.skillPoints--;
        this.skills[skillKey] = lvl + 1;
        return true;
    }

    // Learned level plus item bonuses. Fireball gains the '의 마법사' suffix
    // bonus; returns 0 for skills the character hasn't learned.
    effectiveSkillLevel(skillKey) {
        const base = this.skills[skillKey] || 0;
        if (base === 0) return 0;
        return base + (skillKey === 'fireball' ? (this.fireballBonus || 0) : 0);
    }

    update(map) {
        if (this.state === 'attack') {
            this.attackTimer--;
            this.animTimer += this.animSpeed;
            if (this.attackTimer <= 0) {
                this.state = 'idle';
            }
            return;
        }

        if (this.movement) {
            this.movement.update();
        }

        // Mana regen scales with level so fireball cost growth stays usable
        if (this.mp < this.maxMp) {
            this.mp = Math.min(this.maxMp, this.mp + (1 + this.level * 0.1) / 60);
        }
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        const isoPos = {
            x: this.x - this.y,
            y: (this.x + this.y) * 0.5
        };

        const screenX = isoPos.x - isoCam.x + halfWidth;
        const screenY = isoPos.y - isoCam.y + halfHeight;

        if (this.isLoaded && this.processedSheet) {
            // hero.png is a labeled animation sheet. Idle/walk rows sit on a
            // 128px grid, but the Attack 1 row is hand-spaced with weapon art
            // bleeding past the grid, so its frames use explicit source rects:
            // [srcX, srcW, anchorX] where anchorX is the knight body center.
            const frameW = this.spriteSheet.width / 8;
            const anims = {
                idle:   { sy: 28,  sh: 124, frames: 6 },
                walk:   { sy: 336, sh: 112, frames: 8 },
                attack: { sy: 478, sh: 118, rects: [
                    [5, 130, 44], [140, 118, 38], [261, 149, 45], [412, 112, 27],
                    [526, 122, 35], [649, 121, 37], [771, 153, 41]
                ] }
            };
            const anim = anims[this.state] || anims.idle;
            const frameCount = anim.rects ? anim.rects.length : anim.frames;

            let col;
            if (this.state === 'walk') {
                col = Math.floor(this.animTimer) % frameCount;
            } else if (this.state === 'attack') {
                const t = 1 - (this.attackTimer / this.attackDuration);
                col = Math.floor(t * frameCount) % frameCount;
            } else {
                col = Math.floor(Date.now() / 180) % frameCount;
            }

            let sx, sw, anchorX;
            if (anim.rects) {
                const r = anim.rects.at(col);
                sx = r.at(0);
                sw = r.at(1);
                anchorX = r.at(2);
            } else {
                sx = col * frameW;
                sw = frameW;
                anchorX = frameW / 2;
            }

            const drawH = 80;
            const scale = drawH / anim.sh;
            const drawW = Math.round(sw * scale);

            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.ellipse(screenX, screenY + 8, 14, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // sheet faces right; flip when moving toward screen-left
            if (this.direction >= 2 && this.direction <= 4) {
                ctx.translate(screenX, 0);
                ctx.scale(-1, 1);
                ctx.translate(-screenX, 0);
            }
            ctx.drawImage(
                this.processedSheet,
                sx,
                anim.sy,
                sw,
                anim.sh,
                Math.round(screenX - anchorX * scale),
                screenY + 32 - drawH,
                drawW,
                drawH
            );
            ctx.restore();
        } else {
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(212, 175, 55, 0.4)';

            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(screenX, screenY + 4, 16, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1e1111'; 
            ctx.beginPath();
            ctx.arc(screenX, screenY - 8, 12, 0, Math.PI, false);
            ctx.lineTo(screenX + 12, screenY + 6);
            ctx.lineTo(screenX - 12, screenY + 6);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#0d0d0d'; 
            ctx.beginPath();
            ctx.arc(screenX, screenY - 18, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ff3333';
            ctx.beginPath();
            const eyeOffset = this.getEyeOffsets();
            ctx.arc(screenX - 3 + eyeOffset.x, screenY - 18 + eyeOffset.y, 1.5, 0, Math.PI * 2);
            ctx.arc(screenX + 3 + eyeOffset.x, screenY - 18 + eyeOffset.y, 1.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#bf8a3c';
            ctx.beginPath();
            ctx.arc(screenX - 8, screenY - 8, 4, 0, Math.PI * 2);
            ctx.arc(screenX + 8, screenY - 8, 4, 0, Math.PI * 2);
            ctx.fill();

            if (this.state === 'attack') {
                ctx.strokeStyle = 'rgba(255, 230, 180, 0.8)';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                const angleOffset = (this.direction * (Math.PI / 4));
                const swingStart = angleOffset - Math.PI / 3;
                const swingEnd = angleOffset + Math.PI / 3;
                const t = 1 - (this.attackTimer / this.attackDuration);
                const currentAngle = swingStart + (swingEnd - swingStart) * t;
                ctx.arc(screenX, screenY - 8, 25, currentAngle - 0.2, currentAngle + 0.2);
                ctx.stroke();
            } else {
                ctx.fillStyle = '#aaa';
                ctx.strokeStyle = '#3a2e22';
                ctx.lineWidth = 1.5;
                ctx.save();
                ctx.translate(screenX + 14, screenY - 14 + Math.sin(Date.now() * 0.005) * 3);
                ctx.rotate(Math.PI / 6);
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(2, -12);
                ctx.lineTo(2, 0);
                ctx.lineTo(-2, 0);
                ctx.lineTo(-2, -12);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#bf8a3c';
                ctx.fillRect(-4, 0, 8, 2);
                ctx.fillRect(-1, 2, 2, 4);
                ctx.restore();
            }

            ctx.shadowBlur = 0;
        }

        if (this.hp < this.maxHp) {
            const barW = 32;
            const barH = 4;
            const bx = screenX - barW / 2;
            const by = screenY - 36;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(bx, by, barW * (this.hp / this.maxHp), barH);
        }
    }

    getEyeOffsets() {
        const offsets = [
            { x: 3, y: 1 },  
            { x: 2, y: 2 },  
            { x: 0, y: 3 },  
            { x: -2, y: 2 }, 
            { x: -3, y: 1 }, 
            { x: -2, y: 0 }, 
            { x: 0, y: -1 }, 
            { x: 2, y: 0 }   
        ];
        return offsets.at(this.direction) || { x: 0, y: 0 };
    }
}

// ==========================================
// 4. SKELETON MONSTER & COMBAT SYSTEM
// ==========================================
class Monster {
    constructor(x, y, level = 1, rank = 'normal', kind = 'skeleton', bossType = 'butcher') {
        this.x = x;
        this.y = y;
        this.radius = 14;

        this.level = level;
        this.kind = kind; // skeleton | necromancer | zombie | slime
        const monsterScale = 1 + (level - 1) * 0.25;
        this.maxHp = Math.floor((30 + level * 10) * monsterScale);
        this.hp = this.maxHp;
        this.atk = Math.floor((5 + level * 2) * monsterScale);
        this.speed = 1.2 + Math.random() * 0.4;
        this.expValue = Math.floor((20 + level * 5) * monsterScale);

        this.state = 'walk';
        this.deathTimer = 40;
        this.direction = 0;

        this.attackCooldown = 0;
        this.attackInterval = 60;
        this.windup = 0; // boss telegraph: frames remaining before the strike lands
        this.slowTimer = 0; // frost effect: halves movement while > 0
        this.dashTimer = 0;      // zombie: frames left in a lunge
        this.dashCooldown = 90;  // zombie: frames until next lunge
        this.splitGen = 0;       // slime: split generation (caps recursion)
        this.bodyColor = '#b0a89f';

        this.animTimer = Math.random() * 10;
        this.animSpeed = 0.1;
        // Pre-keyed transparent sheet; drawn directly (works on file://).
        this.spriteSheet = new Image();
        this.spriteSheet.src = 'assets/skeleton.png';
        this.processedSheet = null;
        this.isLoaded = false;
        this.spriteSheet.onload = () => {
            this.processedSheet = this.spriteSheet;
            this.isLoaded = true;
        };
        this.resists = { fire: 0, physical: 0 };

        this.rank = rank;
        this.name = '';
        this.scale = 1;
        this.goldMult = 1;
        this.auraColor = null;

        // Per-kind behaviour and stat tweaks (applied before rank multipliers)
        if (kind === 'necromancer') {
            this.bodyColor = '#9b6bd6';
            this.kindName = '사령술사';
            this.kindAura = '#9b6bd6';
            this.maxHp = Math.floor(this.maxHp * 0.8);
            this.hp = this.maxHp;
            this.attackInterval = 110; // fires a bolt instead of melee
            this.expValue = Math.floor(this.expValue * 1.3);
            this.resists.fire = 0.2;
        } else if (kind === 'zombie') {
            this.bodyColor = '#6f8f5a';
            this.kindName = '좀비';
            this.kindAura = '#6f8f5a';
            this.maxHp = Math.floor(this.maxHp * 1.6);
            this.hp = this.maxHp;
            this.speed *= 0.7; // slow, but lunges
            this.atk = Math.floor(this.atk * 1.2);
            this.expValue = Math.floor(this.expValue * 1.4);
        } else if (kind === 'slime') {
            this.bodyColor = '#3fb86e';
            this.kindName = '슬라임';
            this.kindAura = '#3fb86e';
            this.radius = 12;
            this.maxHp = Math.floor(this.maxHp * 0.7);
            this.hp = this.maxHp;
            this.atk = Math.floor(this.atk * 0.8);
            this.resists.physical = 0.2;
        }

        if (rank === 'champion') {
            const mods = [
                { name: '신속의', speedMult: 1.6 },
                { name: '강철 피부', resists: { physical: 0.5 } },
                { name: '화염심장', resists: { fire: 0.6 } },
                { name: '광폭한', atkMult: 1.4 }
            ];
            const mod = mods.at(Math.floor(Math.random() * mods.length));
            this.name = `${mod.name} 챔피언`;
            this.maxHp *= 3;
            this.hp = this.maxHp;
            this.atk = Math.floor(this.atk * 1.5 * (mod.atkMult || 1));
            this.speed *= (mod.speedMult || 1.15);
            this.expValue = Math.floor(this.expValue * 3.5);
            this.goldMult = 3;
            this.scale = 1.2;
            this.auraColor = '#66aaff';
            if (mod.resists) Object.assign(this.resists, mod.resists);
        } else if (rank === 'boss') {
            this.bossType = bossType;
            this.maxHp *= 10;
            this.hp = this.maxHp;
            this.atk = Math.floor(this.atk * 1.5);
            this.speed = 1.1;
            this.expValue *= 10;
            this.goldMult = 10;
            this.scale = 1.8;
            this.radius = 24;
            this.auraColor = '#ff2200';
            this.resists.physical = 0.3;
            this.resists.fire = 0.3;
            this.attackInterval = 75;

            // Ability timers shared by boss types
            this.summonCooldown = 360;
            this.novaCooldown = 300;
            this.enraged = false;

            if (bossType === 'lich') {
                this.name = '강령왕';
                this.bodyColor = '#9b6bd6';
                this.auraColor = '#a64dff';
                this.maxHp = Math.floor(this.maxHp * 0.85);
                this.hp = this.maxHp;
                this.speed = 0.9;
                this.resists.fire = 0.5;
                this.resists.lightning = 0.3;
            } else if (bossType === 'overlord') {
                this.name = '지옥 군주';
                this.auraColor = '#ff5500';
                this.maxHp = Math.floor(this.maxHp * 1.2);
                this.hp = this.maxHp;
                this.atk = Math.floor(this.atk * 1.2);
                this.scale = 2.0;
                this.radius = 28;
                this.resists.physical = 0.4;
                this.resists.fire = 0.6;
            } else {
                this.name = '도살자';
            }
        }
    }

    update(player, map) {
        if (this.state === 'death') {
            this.deathTimer--;
            return;
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.slowTimer > 0) this.slowTimer--;
        let moveSpeed = this.slowTimer > 0 ? this.speed * 0.5 : this.speed;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);

        // Boss special abilities (summon adds, fire nova, enrage at low HP)
        if (this.rank === 'boss') {
            if (this.summonCooldown > 0) this.summonCooldown--;
            if (this.novaCooldown > 0) this.novaCooldown--;

            if (this.bossType === 'overlord' && !this.enraged && this.hp < this.maxHp * 0.3) {
                this.enraged = true;
                this.atk = Math.floor(this.atk * 1.4);
                this.speed *= 1.5;
                this.auraColor = '#ff2200';
            }
            if (this.bossType === 'overlord') moveSpeed = this.enraged ? this.speed * 1.0 : this.speed;

            if (this.bossType === 'lich') {
                if (this.summonCooldown === 0) {
                    this.summonCooldown = 360;
                    this.pendingSummon = 2; // raise skeletons
                }
                if (this.novaCooldown === 0 && dist < 420) {
                    this.novaCooldown = 90; // frequent ranged bolts
                    this.pendingShot = { tx: player.x, ty: player.y, dmg: Math.floor(this.atk * 0.8) };
                }
            } else if (this.bossType === 'overlord') {
                if (this.novaCooldown === 0) {
                    this.novaCooldown = this.enraged ? 150 : 240;
                    this.pendingNova = { radius: 120, dmg: Math.floor(this.atk * 0.9) };
                }
            }
        }

        // Boss strike telegraph: stand still during windup, then the hit
        // only lands if the player is still inside the strike zone
        if (this.windup > 0) {
            this.windup--;
            if (this.windup === 0 && dist <= 48) {
                return this.atk;
            }
            return 0;
        }

        const aggroRange = this.rank === 'boss' ? 100000 : 250;

        // Necromancer: kite to keep range, then fire a bolt
        if (this.kind === 'necromancer') {
            if (dist < aggroRange) {
                this.animTimer += this.animSpeed;
                const preferred = 170;
                let move = 0;
                if (dist > preferred + 40) move = moveSpeed;        // close in
                else if (dist < preferred - 40) move = -moveSpeed;  // back away
                if (move !== 0 && dist > 0) {
                    const vx = (dx / dist) * move;
                    const vy = (dy / dist) * move;
                    if (!map.isSolid(this.x + vx, this.y)) this.x += vx;
                    if (!map.isSolid(this.x, this.y + vy)) this.y += vy;
                }
                let angle = Math.atan2(dy, dx);
                if (angle < 0) angle += Math.PI * 2;
                this.direction = Math.round(angle / (Math.PI / 4)) % 8;

                if (dist < 340 && this.attackCooldown === 0) {
                    this.attackCooldown = this.attackInterval;
                    this.pendingShot = { tx: player.x, ty: player.y, dmg: this.atk };
                }
            }
            return 0;
        }

        // Zombie: slow shuffle, but lunges in periodic bursts
        if (this.kind === 'zombie') {
            if (this.dashTimer > 0) this.dashTimer--;
            else if (this.dashCooldown > 0) this.dashCooldown--;
            if (this.dashCooldown === 0 && dist < 220 && dist > 30) {
                this.dashTimer = 18;
                this.dashCooldown = 150;
            }
        }
        const kindSpeed = (this.kind === 'zombie' && this.dashTimer > 0) ? moveSpeed * 3.2 : moveSpeed;

        if (dist < aggroRange && dist > 15) {
            this.animTimer += this.animSpeed;

            const vx = (dx / dist) * kindSpeed;
            const vy = (dy / dist) * kindSpeed;

            let angle = Math.atan2(vy, vx);
            if (angle < 0) angle += Math.PI * 2;
            this.direction = Math.round(angle / (Math.PI / 4)) % 8;

            const newX = this.x + vx;
            const newY = this.y + vy;

            if (!map.isSolid(newX, this.y)) this.x = newX;
            if (!map.isSolid(this.x, newY)) this.y = newY;
        }

        if (dist <= (this.rank === 'boss' ? 36 : 24) && this.attackCooldown === 0) {
            this.attackCooldown = this.attackInterval;
            if (this.rank === 'boss') {
                this.windup = 30; // half-second tell before the swing connects
                return 0;
            }
            return this.atk;
        }
        return 0;
    }

    takeDamage(amount, floaters, type = 'physical') {
        if (this.state === 'death') return 0;

        const resist = this.resists[type] || 0;
        const final = Math.max(1, Math.floor(amount * (1 - resist)));

        // Track the player's biggest single hit for the run-over summary
        if (window.game && final > (window.game.maxHit || 0)) window.game.maxHit = final;

        // Damage numbers take the element's tint so hits read at a glance
        const dmgColor = { fire: '#ff8844', cold: '#9adcff', lightning: '#d9b3ff', physical: '#ffcc00' }[type] || '#ffcc00';
        this.hp -= final;
        floaters.add(this.x, this.y - 12, final.toString(), dmgColor);

        if (this.hp <= 0) {
            this.state = 'death';
            return this.expValue;
        }
        return 0;
    }

    applySlow(frames) {
        this.slowTimer = Math.max(this.slowTimer, frames);
    }

    render(ctx, camera, viewWidth, viewHeight) {
        if (this.state === 'death' && this.deathTimer <= 0) return;

        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        const isoPos = {
            x: this.x - this.y,
            y: (this.x + this.y) * 0.5
        };

        const screenX = isoPos.x - isoCam.x + halfWidth;
        const screenY = isoPos.y - isoCam.y + halfHeight;

        const buffer = 80;
        if (screenX < -buffer || screenX > viewWidth + buffer || 
            screenY < -buffer || screenY > viewHeight + buffer) {
            return;
        }

        ctx.save();
        if (this.state === 'death') {
            ctx.globalAlpha = Math.max(0, this.deathTimer / 40);
        }

        // Champions and bosses are drawn larger around their anchor point
        if (this.scale !== 1) {
            ctx.translate(screenX, screenY);
            ctx.scale(this.scale, this.scale);
            ctx.translate(-screenX, -screenY);
        }

        // Rank aura (champion/boss) takes priority; otherwise a softer kind tint
        const aura = this.auraColor || (this.kind !== 'skeleton' ? this.kindAura : null);
        if (aura && this.state !== 'death') {
            ctx.save();
            const strong = !!this.auraColor;
            ctx.globalAlpha = (strong ? 0.3 : 0.18) + Math.sin(Date.now() * 0.006) * 0.08;
            ctx.shadowBlur = strong ? 14 : 9;
            ctx.shadowColor = aura;
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.ellipse(screenX, screenY + 4, 16, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Boss windup warning: red strike-zone ring that tightens as the hit lands
        if (this.windup > 0 && this.state !== 'death') {
            ctx.save();
            const progress = 1 - this.windup / 30;
            // compensate for the rank scale transform so the ring matches
            // the real strike radius (48 world units)
            const ringR = (48 - progress * 16) / this.scale;
            ctx.globalAlpha = 0.35 + progress * 0.4;
            ctx.strokeStyle = '#ff2200';
            ctx.lineWidth = 2 + progress * 2;
            ctx.beginPath();
            ctx.ellipse(screenX, screenY + 4, ringR, ringR / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 4, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Frost-slow shimmer
        if (this.slowTimer > 0 && this.state !== 'death') {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#5bc8ff';
            ctx.fillStyle = 'rgba(120, 210, 255, 0.5)';
            ctx.beginPath();
            ctx.ellipse(screenX, screenY - 6, 10, 14, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (this.kind === 'slime') {
            // Procedural gelatinous blob (no sprite); wobbles as it moves
            const wob = Math.sin(this.animTimer * 1.5) * 2;
            const bw = 16 + wob;
            const bh = 13 - wob * 0.5;
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.bodyColor;
            const grad = ctx.createRadialGradient(screenX - 4, screenY - 8, 2, screenX, screenY - 4, bw);
            grad.addColorStop(0, '#d7ffe6');
            grad.addColorStop(0.4, this.bodyColor);
            grad.addColorStop(1, '#1c6b3c');
            ctx.fillStyle = grad;
            ctx.globalAlpha = this.state === 'death' ? Math.max(0, this.deathTimer / 40) : 0.92;
            ctx.beginPath();
            ctx.ellipse(screenX, screenY - 4, bw, bh, 0, 0, Math.PI * 2);
            ctx.fill();
            // eyes
            if (this.state !== 'death') {
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#11321f';
                ctx.beginPath();
                ctx.arc(screenX - 4, screenY - 6, 1.8, 0, Math.PI * 2);
                ctx.arc(screenX + 4, screenY - 6, 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else if (this.isLoaded && this.processedSheet) {
            // skeleton.png is a labeled animation sheet (8 columns of 128px);
            // walk uses cols 0-3 of the Walk/Run band, death plays its own band.
            const frameW = this.spriteSheet.width / 8;
            const anims = {
                walk:  { sy: 197, sh: 124, frames: 4 },
                death: { sy: 766, sh: 104, frames: 8 }
            };
            const anim = this.state === 'death' ? anims.death : anims.walk;

            let col;
            if (this.state === 'death') {
                const t = 1 - Math.max(0, this.deathTimer) / 40;
                col = Math.min(anim.frames - 1, Math.floor(t * anim.frames));
            } else {
                col = Math.floor(this.animTimer) % anim.frames;
            }

            const drawW = 56;
            const drawH = Math.round(drawW * anim.sh / frameW);

            ctx.save();
            if (this.direction >= 2 && this.direction <= 4) {
                ctx.translate(screenX, 0);
                ctx.scale(-1, 1);
                ctx.translate(-screenX, 0);
            }
            ctx.drawImage(
                this.processedSheet,
                col * frameW,
                anim.sy,
                frameW,
                anim.sh,
                screenX - drawW / 2,
                screenY + 16 - drawH,
                drawW,
                drawH
            );
            ctx.restore();
        } else {
            ctx.fillStyle = '#b0a89f'; 
            ctx.strokeStyle = '#3a332a';
            ctx.lineWidth = 1;

            if (this.state === 'death') {
                ctx.fillStyle = '#6a645d';
                ctx.fillRect(screenX - 8, screenY, 6, 3);
                ctx.fillRect(screenX + 2, screenY - 2, 8, 3);
                ctx.beginPath();
                ctx.arc(screenX - 2, screenY - 4, 5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(screenX, screenY - 16 + Math.sin(Date.now() * 0.007) * 2, 7, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ff0000';
                ctx.fillRect(screenX - 3, screenY - 17 + Math.sin(Date.now() * 0.007) * 2, 1.5, 1.5);
                ctx.fillRect(screenX + 1.5, screenY - 17 + Math.sin(Date.now() * 0.007) * 2, 1.5, 1.5);

                ctx.strokeStyle = '#b0a89f';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(screenX, screenY - 9);
                ctx.lineTo(screenX, screenY + 2);
                ctx.moveTo(screenX - 7, screenY - 6);
                ctx.lineTo(screenX + 7, screenY - 6);
                ctx.moveTo(screenX - 5, screenY - 2);
                ctx.lineTo(screenX + 5, screenY - 2);
                ctx.stroke();

                ctx.fillStyle = '#b0a89f';
                ctx.beginPath();
                ctx.arc(screenX - 10, screenY - 2, 2.5, 0, Math.PI * 2);
                ctx.arc(screenX + 10, screenY - 2, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (this.hp < this.maxHp && this.state !== 'death') {
            const barW = 24;
            const barH = 3;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(screenX - barW / 2, screenY - 26, barW, barH);
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(screenX - barW / 2, screenY - 26, barW * (this.hp / this.maxHp), barH);
        }

        // Named ranks (champion/boss) label brightly; plain kinds get a subtle tag
        const label = this.name || (this.kind !== 'skeleton' ? this.kindName : '');
        if (label && this.state !== 'death') {
            ctx.fillStyle = this.auraColor || this.kindAura || '#ffffff';
            ctx.font = this.name ? 'bold 11px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 4;
            ctx.fillText(label, screenX, screenY - 32);
        }

        ctx.restore();
    }
}

// ==========================================
// 5. FIREBALL PROJECTILE ENGINE
// ==========================================
class Projectile {
    constructor(x, y, tx, ty, damage = 25, level = 1, type = 'physical', skillKey = 'fireball') {
        this.x = x;
        this.y = y;
        this.radius = 8 + (level - 1) * 0.5;
        this.damage = damage;
        this.life = 70;
        this.level = level;

        const dx = tx - x;
        const dy = ty - y;
        const dist = Math.hypot(dx, dy) || 1; // avoid NaN velocity when target equals origin
        const speed = 7;
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
        this.angle = Math.atan2(dy, dx);
        this.type = type;

        const def = SKILLS[skillKey] || SKILLS.fireball;
        this.skillKey = skillKey;
        this.color = def.color || '#ff4500';
        this.slow = def.slow || 0;     // frames of slow applied on hit
        this.splash = def.splash || 0; // splash radius on impact (0 = single target)
    }

    update(map) {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        if (map.isSolid(this.x, this.y)) {
            this.life = 0;
        }
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        const screenX = (this.x - this.y) - isoCam.x + halfWidth;
        const screenY = (this.x + this.y) * 0.5 - isoCam.y + halfHeight;

        ctx.save();
        ctx.shadowBlur = 15 + (this.level - 1) * 2;
        ctx.shadowColor = this.color;

        const grad = ctx.createRadialGradient(screenX, screenY, 1, screenX, screenY, this.radius + 4);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.45, this.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius + 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.4;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        const trailX = screenX - Math.cos(this.angle) * 10;
        const trailY = screenY - Math.sin(this.angle) * 5;
        ctx.arc(trailX, trailY, this.radius * 0.75, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Necromancer bolt: travels toward the player and is checked against the
// player (not monsters) in the game loop.
class EnemyProjectile {
    constructor(x, y, tx, ty, damage) {
        this.x = x;
        this.y = y;
        this.radius = 7;
        this.damage = damage;
        this.life = 110;
        const dx = tx - x;
        const dy = ty - y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = 4.2;
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
    }

    update(map) {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        if (map.isSolid(this.x, this.y)) this.life = 0;
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const screenX = (this.x - this.y) - isoCam.x + viewWidth / 2;
        const screenY = (this.x + this.y) * 0.5 - isoCam.y + viewHeight / 2;
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#a64dff';
        const grad = ctx.createRadialGradient(screenX, screenY, 1, screenX, screenY, this.radius + 3);
        grad.addColorStop(0, '#e6ccff');
        grad.addColorStop(0.5, '#9b30ff');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// 6.5. TOWN PORTAL ENGINE
// ==========================================
class Portal {
    constructor(x, y, targetMap) {
        this.x = x;
        this.y = y;
        this.targetMap = targetMap;
        this.radius = 16;
        this.animTimer = 0;
    }

    update() {
        this.animTimer += 0.05;
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        const screenX = (this.x - this.y) - isoCam.x + halfWidth;
        const screenY = (this.x + this.y) * 0.5 - isoCam.y + halfHeight;

        ctx.save();
        const pulse = Math.sin(this.animTimer) * 3;
        ctx.shadowBlur = 20 + pulse;
        ctx.shadowColor = '#00aaff';

        // Outer ring
        ctx.fillStyle = 'rgba(0, 170, 255, 0.2)';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, 20 + pulse, 10 + pulse / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner core
        const grad = ctx.createRadialGradient(screenX, screenY, 1, screenX, screenY, 12);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#00ffff');
        grad.addColorStop(1, 'rgba(0, 128, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY - 2, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Swirling portal effect
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, 8 + pulse, 4 + pulse / 2, this.animTimer, 0, Math.PI);
        ctx.stroke();

        ctx.restore();
    }
}

// ==========================================
// 6.6. MERCHANT NPC
// ==========================================
class Npc {
    constructor(x, y, name) {
        this.x = x;
        this.y = y;
        this.name = name;
        this.radius = 16;
        this.animTimer = 0;
    }

    update() {
        this.animTimer += 0.03;
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        const screenX = (this.x - this.y) - isoCam.x + halfWidth;
        const screenY = (this.x + this.y) * 0.5 - isoCam.y + halfHeight;

        ctx.save();
        
        // Ellipse shadow under feet
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + 4, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Idle floating bounce animation
        const bounce = Math.sin(this.animTimer) * 2;

        // Staff (Behind/Side)
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - 8, screenY + 6 + bounce);
        ctx.lineTo(screenX - 8, screenY - 24 + bounce);
        ctx.stroke();

        // Golden gem on top of the staff
        ctx.fillStyle = '#ffd700';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath();
        ctx.arc(screenX - 8, screenY - 26 + bounce, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Cloak/Body (Gothic Purple)
        ctx.fillStyle = '#4a148c';
        ctx.beginPath();
        ctx.moveTo(screenX - 10, screenY + 4 + bounce);
        ctx.lineTo(screenX + 10, screenY + 4 + bounce);
        ctx.lineTo(screenX + 6, screenY - 14 + bounce);
        ctx.lineTo(screenX - 6, screenY - 14 + bounce);
        ctx.closePath();
        ctx.fill();

        // Hood/Head
        ctx.fillStyle = '#311b92';
        ctx.beginPath();
        ctx.arc(screenX, screenY - 16 + bounce, 6, 0, Math.PI * 2);
        ctx.fill();

        // Shadow inside hood (Face area)
        ctx.fillStyle = '#110022';
        ctx.beginPath();
        ctx.arc(screenX, screenY - 15 + bounce, 3, 0, Math.PI * 2);
        ctx.fill();

        // Golden Trim/Accents on Cloak
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenX - 6, screenY - 14 + bounce);
        ctx.lineTo(screenX, screenY + 4 + bounce);
        ctx.lineTo(screenX + 6, screenY - 14 + bounce);
        ctx.stroke();

        // NPC Name floating above
        ctx.fillStyle = '#d4af37';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000000';
        ctx.fillText(this.name, screenX, screenY - 32 + bounce);

        ctx.restore();
    }
}

// ==========================================
// 6.7. DECORATIVE PROP ENGINE
// ==========================================
class Prop {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.animTimer = Math.random() * 10;
        this.seed = Math.floor(Math.random() * 1000);
        // Flat decals draw beneath every actor and wall
        this.depthOffset = (type === 'stairs' || type === 'bones' || type === 'trap') ? -1e6 : 0;
    }

    update() {
        this.animTimer += 0.08;
    }

    // Light radius for the dungeon darkness pass (0 = not a light source)
    lightRadius() {
        if (this.type === 'torch') return 105 + Math.sin(this.animTimer * 4) * 8;
        if (this.type === 'campfire') return 130 + Math.sin(this.animTimer * 3) * 10;
        if (this.type === 'chest' && !this.opened) return 70;
        if (this.type === 'altar' && !this.used) return 80;
        return 0;
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const screenX = (this.x - this.y) - isoCam.x + viewWidth / 2;
        const screenY = (this.x + this.y) * 0.5 - isoCam.y + viewHeight / 2;

        const buffer = 120;
        if (screenX < -buffer || screenX > viewWidth + buffer ||
            screenY < -buffer || screenY > viewHeight + buffer) {
            return;
        }

        ctx.save();
        const draw = Prop.RENDERERS[this.type];
        if (draw) draw(ctx, screenX, screenY, this);
        ctx.restore();
    }
}

Prop.RENDERERS = {
    torch(ctx, x, y, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // pole and iron bowl
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(x - 1.5, y - 26, 3, 27);
        ctx.fillStyle = '#3a322a';
        ctx.beginPath();
        ctx.ellipse(x, y - 26, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // flickering flame
        const f = Math.sin(p.animTimer * 5 + p.seed) * 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff8800';
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.ellipse(x, y - 32 - f * 0.5, 3.5, 6 + f, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcc44';
        ctx.beginPath();
        ctx.ellipse(x, y - 31 - f * 0.4, 1.8, 3.5 + f * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    pillar(ctx, x, y) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 11, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const grad = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
        grad.addColorStop(0, '#4a4036');
        grad.addColorStop(0.5, '#6a5d4e');
        grad.addColorStop(1, '#3a322a');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 8, y - 46, 16, 48);
        // capital and base
        ctx.fillStyle = '#55483c';
        ctx.fillRect(x - 10, y - 50, 20, 6);
        ctx.fillRect(x - 10, y - 2, 20, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x - 8, y - 30, 16, 2);
        ctx.fillRect(x - 8, y - 16, 16, 2);
    },

    bones(ctx, x, y) {
        ctx.fillStyle = '#b8b2a2';
        ctx.fillRect(x - 8, y - 1, 12, 2.5);
        ctx.fillRect(x + 2, y - 5, 2.5, 9);
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(x - 7, y - 6, 1.5, 1.5);
        ctx.fillRect(x - 4, y - 6, 1.5, 1.5);
    },

    sarcophagus(ctx, x, y) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 26, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        // iso stone box
        ctx.fillStyle = '#3f372d';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 4);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x, y + 22);
        ctx.lineTo(x - 24, y + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#322b23';
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + 24, y - 4);
        ctx.lineTo(x + 24, y + 10);
        ctx.lineTo(x, y + 22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#574c3e';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 18);
        ctx.lineTo(x, y - 6);
        ctx.lineTo(x + 24, y - 18);
        ctx.lineTo(x, y - 30);
        ctx.closePath();
        ctx.fill();
        // lid seam + carving
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 4);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x + 24, y - 4);
        ctx.moveTo(x - 10, y - 18);
        ctx.lineTo(x + 10, y - 18);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - 24, y - 5, 48, 2);
    },

    jar(ctx, x, y) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a5230';
        ctx.beginPath();
        ctx.ellipse(x, y - 6, 6.5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5e3f24';
        ctx.fillRect(x - 3, y - 17, 6, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.ellipse(x - 2.5, y - 8, 2, 4.5, -0.3, 0, Math.PI * 2);
        ctx.fill();
    },

    stairs(ctx, x, y, p) {
        // dark descending hatch with glowing rim so it reads as the exit
        const pulse = 0.5 + Math.sin(p.animTimer * 2) * 0.2;
        ctx.fillStyle = '#060403';
        ctx.beginPath();
        ctx.moveTo(x, y - 16);
        ctx.lineTo(x + 32, y);
        ctx.lineTo(x, y + 16);
        ctx.lineTo(x - 32, y);
        ctx.closePath();
        ctx.fill();
        // descending steps as shrinking concentric rims
        ctx.strokeStyle = 'rgba(150, 130, 90, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 1; i <= 3; i++) {
            const s = 1 - i * 0.24;
            ctx.moveTo(x, y - 16 * s);
            ctx.lineTo(x + 32 * s, y);
            ctx.lineTo(x, y + 16 * s);
            ctx.lineTo(x - 32 * s, y);
            ctx.closePath();
        }
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 200, 90, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 16);
        ctx.lineTo(x + 32, y);
        ctx.lineTo(x, y + 16);
        ctx.lineTo(x - 32, y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 200, 90, ${pulse * 0.9})`;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('아래층', x, y - 22);
    },

    house(ctx, x, y) {
        // front-left and front-right walls
        ctx.fillStyle = '#4a3b2c';
        ctx.beginPath();
        ctx.moveTo(x - 56, y - 38);
        ctx.lineTo(x, y - 10);
        ctx.lineTo(x, y + 26);
        ctx.lineTo(x - 56, y - 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a2d20';
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 56, y - 38);
        ctx.lineTo(x + 56, y - 2);
        ctx.lineTo(x, y + 26);
        ctx.closePath();
        ctx.fill();
        // roof slopes
        ctx.fillStyle = '#6e3b28';
        ctx.beginPath();
        ctx.moveTo(x - 62, y - 36);
        ctx.lineTo(x, y - 66);
        ctx.lineTo(x + 8, y - 62);
        ctx.lineTo(x + 4, y - 8);
        ctx.lineTo(x, y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#532c1e';
        ctx.beginPath();
        ctx.moveTo(x + 62, y - 36);
        ctx.lineTo(x, y - 66);
        ctx.lineTo(x + 4, y - 8);
        ctx.closePath();
        ctx.fill();
        // door and window
        ctx.fillStyle = '#241a10';
        ctx.beginPath();
        ctx.moveTo(x - 26, y - 6);
        ctx.lineTo(x - 12, y + 1);
        ctx.lineTo(x - 12, y + 17);
        ctx.lineTo(x - 26, y + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(x + 18, y - 14, 12, 9);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x + 23, y - 14, 2, 9);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 18, y - 14, 12, 9);
    },

    well(ctx, x, y) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // stone ring
        ctx.fillStyle = '#5e564a';
        ctx.beginPath();
        ctx.ellipse(x, y, 18, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a1418';
        ctx.beginPath();
        ctx.ellipse(x, y - 1, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // posts and tiny roof
        ctx.fillStyle = '#3e2c1c';
        ctx.fillRect(x - 16, y - 26, 3, 26);
        ctx.fillRect(x + 13, y - 26, 3, 26);
        ctx.fillStyle = '#6e3b28';
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 24);
        ctx.lineTo(x, y - 36);
        ctx.lineTo(x + 22, y - 24);
        ctx.lineTo(x, y - 30);
        ctx.closePath();
        ctx.fill();
    },

    campfire(ctx, x, y, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // stone ring + logs
        ctx.fillStyle = '#55504a';
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 6, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = '#4a3320';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 7, y + 3);
        ctx.lineTo(x + 7, y - 3);
        ctx.moveTo(x - 7, y - 3);
        ctx.lineTo(x + 7, y + 3);
        ctx.stroke();
        // flames
        const f = Math.sin(p.animTimer * 6 + p.seed) * 2.5;
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#ff7700';
        ctx.fillStyle = '#ff5500';
        ctx.beginPath();
        ctx.ellipse(x, y - 8 - f * 0.5, 6, 10 + f, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffbb33';
        ctx.beginPath();
        ctx.ellipse(x, y - 6 - f * 0.3, 3, 6 + f * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    fence(ctx, x, y) {
        ctx.fillStyle = '#3e2c1c';
        ctx.fillRect(x - 14, y - 14, 3, 16);
        ctx.fillRect(x + 11, y - 14, 3, 16);
        ctx.fillStyle = '#4a3522';
        ctx.fillRect(x - 14, y - 12, 28, 2.5);
        ctx.fillRect(x - 14, y - 5, 28, 2.5);
    },

    crate(ctx, x, y) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6a4d2e';
        ctx.beginPath();
        ctx.moveTo(x - 12, y - 6);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x - 12, y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#54391f';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y - 6);
        ctx.lineTo(x + 12, y + 8);
        ctx.lineTo(x, y + 14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7e5c38';
        ctx.beginPath();
        ctx.moveTo(x - 12, y - 6);
        ctx.lineTo(x, y - 12);
        ctx.lineTo(x + 12, y - 6);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
    },

    chest(ctx, x, y, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 15, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        const opened = p.opened;
        if (!opened) {
            const glow = 0.4 + Math.sin(p.animTimer * 2) * 0.2;
            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = `rgba(255, 210, 90, ${glow})`;
            // body
            ctx.fillStyle = '#6a4322';
            ctx.fillRect(x - 13, y - 8, 26, 16);
            // lid
            ctx.fillStyle = '#7e5128';
            ctx.beginPath();
            ctx.moveTo(x - 13, y - 8);
            ctx.lineTo(x, y - 16);
            ctx.lineTo(x + 13, y - 8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // gold bands + lock
            ctx.fillStyle = '#d4af37';
            ctx.fillRect(x - 13, y - 1, 26, 3);
            ctx.fillRect(x - 2, y - 6, 4, 8);
        } else {
            // open, emptied chest
            ctx.fillStyle = '#4a3018';
            ctx.fillRect(x - 13, y - 4, 26, 12);
            ctx.fillStyle = '#2a1c0e';
            ctx.fillRect(x - 11, y - 2, 22, 8);
            ctx.fillStyle = '#5a3a1e';
            ctx.beginPath();
            ctx.moveTo(x - 13, y - 4);
            ctx.lineTo(x - 4, y - 18);
            ctx.lineTo(x + 6, y - 16);
            ctx.lineTo(x + 13, y - 4);
            ctx.closePath();
            ctx.fill();
        }
    },

    altar(ctx, x, y, p) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 18, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        // stone base
        ctx.fillStyle = '#4a4450';
        ctx.fillRect(x - 14, y - 6, 28, 14);
        ctx.fillStyle = '#5a5460';
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 6);
        ctx.lineTo(x, y - 12);
        ctx.lineTo(x + 14, y - 6);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        // blood bowl
        const used = p.used;
        const glow = used ? 0.1 : 0.4 + Math.sin(p.animTimer * 2) * 0.2;
        ctx.save();
        ctx.shadowBlur = used ? 4 : 14;
        ctx.shadowColor = `rgba(200, 30, 30, ${glow})`;
        ctx.fillStyle = used ? '#3a2020' : '#b01818';
        ctx.beginPath();
        ctx.ellipse(x, y - 11, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    trap(ctx, x, y, p) {
        // armed: faint rune ring; just-triggered: spikes flash up
        const firing = p.cooldown > 100;
        ctx.save();
        ctx.strokeStyle = firing ? 'rgba(255, 70, 50, 0.9)' : 'rgba(180, 120, 90, 0.35)';
        ctx.lineWidth = firing ? 2 : 1;
        ctx.beginPath();
        ctx.ellipse(x, y, 22, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (firing) {
            ctx.fillStyle = '#cfd3d8';
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const sx = x + Math.cos(a) * 12;
                const sy = y + Math.sin(a) * 6;
                ctx.beginPath();
                ctx.moveTo(sx - 2, sy);
                ctx.lineTo(sx, sy - 10);
                ctx.lineTo(sx + 2, sy);
                ctx.closePath();
                ctx.fill();
            }
        } else {
            // dormant rune cross
            ctx.beginPath();
            ctx.moveTo(x - 6, y);
            ctx.lineTo(x + 6, y);
            ctx.moveTo(x, y - 3);
            ctx.lineTo(x, y + 3);
            ctx.stroke();
        }
        ctx.restore();
    }
};

// ==========================================
// 6. FLOATING TEXT EFFECTS ENGINE
// ==========================================
class FloaterManager {
    constructor() {
        this.floaters = [];
    }

    add(worldX, worldY, text, color = '#ffffff') {
        this.floaters.push({
            worldX,
            worldY,
            text,
            color,
            life: 40,
            maxLife: 40
        });
    }

    update() {
        for (let i = this.floaters.length - 1; i >= 0; i--) {
            const f = this.floaters.at(i);
            f.life--;
            f.worldY -= 0.6;
            if (f.life <= 0) {
                this.floaters.splice(i, 1);
            }
        }
    }

    render(ctx, camera, viewWidth, viewHeight) {
        const isoCam = camera.getIsoOffset();
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        ctx.save();
        ctx.font = 'bold 15px Inter, sans-serif';
        ctx.textAlign = 'center';

        for (const f of this.floaters) {
            const screenX = (f.worldX - f.worldY) - isoCam.x + halfWidth;
            const screenY = (f.worldX + f.worldY) * 0.5 - isoCam.y + halfHeight;

            const alpha = f.life / f.maxLife;
            ctx.fillStyle = f.color;
            ctx.globalAlpha = alpha;
            
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 4;

            ctx.fillText(f.text, screenX, screenY);
        }
        ctx.restore();
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.isGameRunning = false;

        this.currentMap = 'dungeon';
        this.floor = 1;
        this.dungeonMap = new TileMap(64, 'dungeon', this.floor);
        this.townMap = new TileMap(64, 'town');
        this.map = this.dungeonMap;

        const spawn = this.dungeonMap.spawnPoint;
        this.player = new Player(spawn.x, spawn.y);

        this.camera = new Camera(spawn.x, spawn.y);

        this.props = this.buildDungeonProps(this.dungeonMap);
        this.townProps = this.buildTownProps();
        this.particles = this.initParticles();
        this.lightCanvas = null;
        const minimapEl = document.getElementById('minimap');
        this.minimapCtx = minimapEl ? minimapEl.getContext('2d') : null;

        this.monsters = [];
        this.projectiles = [];
        this.enemyProjectiles = []; // necromancer bolts aimed at the player
        this.effects = []; // transient visual FX (lightning arcs, whirlwind rings)
        this.dungeonPortal = null;
        this.townPortal = null;
        this.floaters = new FloaterManager();
        this.spawnTimer = 0;

        const townCenterCartX = 8 * this.townMap.tileSize + this.townMap.tileSize / 2;
        const townNpcCartY = 5 * this.townMap.tileSize + this.townMap.tileSize / 2;
        this.npc = new Npc(townCenterCartX, townNpcCartY, "아카라");

        this.inventory = new Array(16).fill(null);
        this.mouse = { x: 0, y: 0, isDown: false, button: -1 };
        this.zoom = 1.6;
        this.stairsMsgCooldown = 0;
        this.altarMsgCooldown = 0;
        this.selectedGemIdx = null;
        this.dragSrcIdx = null; // source slot index during an inventory drag
        this.keys = {};
        this.maxHit = 0;
        this.runStartTime = 0;

        this.castTimer = 0;
        this.maxCastTimer = 1;
        this.castAction = null;
        this.castName = '';

        this.player.setClass('warrior');

        this.setupUI();
        this.setupInputs();

        this.combat = new CombatSystem(this);
        this.monsterFactory = new MonsterFactory(this);
        this.playerMovement = new PlayerMovementSystem(this.player, this.map);
        this.player.movement = this.playerMovement;

        this.player.recalculateStats(this.inventory);
        this.updateUI();

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    setupUI() {
        const toggleStatsBtn = document.getElementById('toggle-stats-btn');
        const statsPanel = document.getElementById('stats-panel');
        const closeStatsBtn = document.getElementById('close-stats-btn');

        const toggleStats = () => {
            sfx.init();
            statsPanel.classList.toggle('hidden');
        };
        toggleStatsBtn.addEventListener('click', toggleStats);
        closeStatsBtn.addEventListener('click', () => statsPanel.classList.add('hidden'));

        const toggleInvBtn = document.getElementById('toggle-inv-btn');
        const invPanel = document.getElementById('inventory-panel');
        const closeInvBtn = document.getElementById('close-inv-btn');

        const toggleInv = () => {
            sfx.init();
            invPanel.classList.toggle('hidden');
        };
        toggleInvBtn.addEventListener('click', toggleInv);
        closeInvBtn.addEventListener('click', () => invPanel.classList.add('hidden'));

        const toggleSkillsBtn = document.getElementById('toggle-skills-btn');
        const skillsPanel = document.getElementById('skills-panel');
        const closeSkillsBtn = document.getElementById('close-skills-btn');

        const toggleSkills = () => {
            sfx.init();
            skillsPanel.classList.toggle('hidden');
        };
        toggleSkillsBtn.addEventListener('click', toggleSkills);
        closeSkillsBtn.addEventListener('click', () => skillsPanel.classList.add('hidden'));

        // Shop UI Bindings
        const shopPanel = document.getElementById('shop-panel');
        const closeShopBtn = document.getElementById('close-shop-btn');
        closeShopBtn.addEventListener('click', () => shopPanel.classList.add('hidden'));

        document.querySelectorAll('.buy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sfx.init();
                const idx = parseInt(btn.dataset.index);
                const itemConfig = SHOP_ITEMS[idx];
                if (!itemConfig) return;

                const price = shopPriceFor(itemConfig.basePrice, this.player.level);
                if (this.player.gold < price) {
                    this.floaters.add(this.player.x, this.player.y - 15, "골드가 부족합니다!", "#ff3333");
                    sfx.playHit();
                    return;
                }

                const emptySlotIdx = this.inventory.indexOf(null);
                if (emptySlotIdx === -1) {
                    this.floaters.add(this.player.x, this.player.y - 15, "소지품 창이 가득 찼습니다!", "#ff3333");
                    sfx.playHit();
                    return;
                }

                // Deduct gold and add potion item
                this.player.gold -= price;
                const isMana = itemConfig.subtype === 'mana';
                const potionItem = {
                    name: itemConfig.name,
                    type: 'potion',
                    slot: 'potion',
                    subtype: itemConfig.subtype,
                    stat: `사용 시 ${isMana ? '마나' : '체력'} ${itemConfig.value}% 회복`,
                    value: itemConfig.value,
                    rarity: 'normal',
                    color: isMana ? '#3a8fff' : '#00ff00',
                    reqLevel: 1
                };

                this.inventory[emptySlotIdx] = potionItem;
                sfx.playPotion();
                this.floaters.add(this.player.x, this.player.y - 15, `물약 구매! (-${price} G)`, "#ffd700");

                this.syncInventoryUI();
                this.updateUI();
            });
        });

        // Gambling: pay for an unidentified piece of gear (always magic or better)
        const gambleBtn = document.getElementById('gamble-btn');
        if (gambleBtn) {
            gambleBtn.addEventListener('click', () => {
                sfx.init();
                const price = shopPriceFor(GAMBLE_BASE_PRICE, this.player.level);

                if (this.player.gold < price) {
                    this.floaters.add(this.player.x, this.player.y - 15, "골드가 부족합니다!", "#ff3333");
                    sfx.playHit();
                    return;
                }
                if (!this.inventory.includes(null)) {
                    this.floaters.add(this.player.x, this.player.y - 15, "소지품 창이 가득 찼습니다!", "#ff3333");
                    sfx.playHit();
                    return;
                }

                this.player.gold -= price;
                this.floaters.add(this.player.x, this.player.y - 15, `도박! (-${price} G)`, "#ffd700");
                this.lootItem(this.player.level, true);
                this.updateUI();
            });
        }

        this.buildSkillsPanel();

        const startBtn = document.getElementById('start-game-btn');
        const guidePanel = document.getElementById('guide-panel');
        startBtn.addEventListener('click', () => {
            sfx.init();
            this.player.setClass('warrior');
            this.player.recalculateStats(this.inventory);
            this.buildSkillsPanel();
            this.updateUI();
            guidePanel.classList.add('hidden');
            this.isGameRunning = true;
            this.runStartTime = Date.now();
            this.maxHit = 0;
            this.spawnInitialMonsters();
        });

        const restartBtn = document.getElementById('gameover-restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => window.location.reload());
        }

        document.getElementById('up-atk').addEventListener('click', () => {
            if (this.player.addStat('atk')) {
                sfx.playPotion();
                this.player.recalculateStats(this.inventory);
                this.updateUI();
            }
        });
        document.getElementById('up-maxhp').addEventListener('click', () => {
            if (this.player.addStat('maxhp')) {
                sfx.playPotion();
                this.player.recalculateStats(this.inventory);
                this.updateUI();
            }
        });
        document.getElementById('up-maxmp').addEventListener('click', () => {
            if (this.player.addStat('maxmp')) {
                sfx.playPotion();
                this.player.recalculateStats(this.inventory);
                this.updateUI();
            }
        });

        document.getElementById('slot-potion').addEventListener('click', () => {
            this.triggerPotion();
        });

        document.getElementById('slot-mana-potion').addEventListener('click', () => {
            this.triggerManaPotion();
        });

        document.getElementById('slot-portal').addEventListener('click', () => {
            sfx.init();
            this.triggerTownPortal();
        });

        document.getElementById('slot-lclick').addEventListener('click', () => {
            if (this.isGameRunning) this.triggerMeleeKey();
        });

        document.getElementById('slot-rclick').addEventListener('click', () => {
            if (this.isGameRunning) this.triggerSkillKey();
        });

        const slots = document.querySelectorAll('.inv-slot');
        const descArea = document.getElementById('item-desc');
        slots.forEach(slot => {
            slot.addEventListener('mouseenter', (e) => {
                const idx = parseInt(e.target.dataset.slot);
                const item = this.inventory.at(idx);
                if (item) {
                    descArea.innerHTML = '';
                    
                    const headerGroup = document.createElement('div');
                    headerGroup.style.display = 'flex';
                    headerGroup.style.justifyContent = 'space-between';
                    headerGroup.style.alignItems = 'center';

                    const strong = document.createElement('strong');
                    strong.style.color = item.color;
                    strong.textContent = item.name;
                    headerGroup.appendChild(strong);

                    if (item.equipped) {
                        const eqSpan = document.createElement('span');
                        eqSpan.style.color = '#d4af37';
                        eqSpan.style.fontWeight = 'bold';
                        eqSpan.style.fontSize = '10px';
                        eqSpan.textContent = '[장착 중]';
                        headerGroup.appendChild(eqSpan);
                    } else if (item.slot !== 'potion' && item.type !== 'gem') {
                        const eqSpan = document.createElement('span');
                        eqSpan.style.color = '#888';
                        eqSpan.style.fontSize = '10px';
                        eqSpan.textContent = '[장착 가능]';
                        headerGroup.appendChild(eqSpan);
                    }
                    descArea.appendChild(headerGroup);

                    descArea.appendChild(document.createTextNode(` (${item.rarity.toUpperCase()})`));
                    descArea.appendChild(document.createElement('br'));
                    const lines = item.stat.split('\n');
                    lines.forEach(line => {
                        descArea.appendChild(document.createTextNode(line));
                        descArea.appendChild(document.createElement('br'));
                    });

                    if (item.sockets) {
                        const filled = item.gems ? item.gems.length : 0;
                        const sockSpan = document.createElement('span');
                        sockSpan.style.color = '#9ad0ff';
                        sockSpan.textContent = `소켓: ${'◆'.repeat(filled)}${'◇'.repeat(item.sockets - filled)}`;
                        descArea.appendChild(sockSpan);
                        descArea.appendChild(document.createElement('br'));
                    }

                    if (item.slot !== 'potion' && item.type !== 'gem') {
                        const reqLvl = item.reqLevel || 1;
                        const reqSpan = document.createElement('span');
                        reqSpan.textContent = `요구 레벨: ${reqLvl}`;
                        if (this.player.level < reqLvl) {
                            reqSpan.style.color = '#ff3333';
                            reqSpan.style.fontWeight = 'bold';
                        } else {
                            reqSpan.style.color = '#e0d8cf';
                        }
                        descArea.appendChild(reqSpan);
                        descArea.appendChild(document.createElement('br'));
                    }

                    const span = document.createElement('span');
                    span.style.color = '#888';
                    span.style.fontSize = '10px';
                    if (item.slot === 'potion') {
                        span.textContent = '(클릭: 벨트에 등록 | Shift+클릭: 파괴, 상점에선 판매)';
                    } else if (item.type === 'gem') {
                        span.textContent = '(클릭: 보석 선택 → 소켓 장비 클릭으로 장착 | Shift+클릭: 파괴, 상점에선 판매)';
                    } else {
                        span.textContent = item.equipped ? '(클릭: 장착 해제 | Shift+클릭: 파괴, 상점에선 판매)' : '(클릭: 아이템 장착 | Shift+클릭: 파괴, 상점에선 판매)';
                    }
                    descArea.appendChild(span);
                } else {
                    descArea.textContent = '빈 슬롯';
                }
            });

            slot.addEventListener('mouseleave', () => {
                descArea.textContent = '슬롯 위의 아이템 정보를 보려면 마우스를 올리세요.';
            });

            // Drag-and-drop to reorder/swap items between slots. A real drag
            // doesn't emit a click, so the equip/use click handler is untouched.
            slot.addEventListener('dragstart', (e) => {
                const idx = parseInt(slot.dataset.slot);
                if (!this.inventory.at(idx)) { e.preventDefault(); return; }
                this.dragSrcIdx = idx;
                slot.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx)); // Firefox needs payload
            });

            slot.addEventListener('dragover', (e) => {
                if (this.dragSrcIdx === null || this.dragSrcIdx === undefined) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (parseInt(slot.dataset.slot) !== this.dragSrcIdx) slot.classList.add('drag-over');
            });

            slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));

            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                const src = this.dragSrcIdx;
                const dst = parseInt(slot.dataset.slot);
                if (src === null || src === undefined || src === dst) return;

                // Swap (moving onto an empty slot leaves the source empty)
                const tmp = this.inventory[dst];
                this.inventory[dst] = this.inventory[src];
                this.inventory[src] = tmp;

                // Keep the selected-gem highlight pointing at the same item
                if (this.selectedGemIdx === src) this.selectedGemIdx = dst;
                else if (this.selectedGemIdx === dst) this.selectedGemIdx = src;

                sfx.init();
                this.syncInventoryUI();
                this.updateUI();
            });

            slot.addEventListener('dragend', () => {
                slot.classList.remove('dragging');
                document.querySelectorAll('.inv-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
                this.dragSrcIdx = null;
            });

            slot.addEventListener('click', (e) => {
                const idx = parseInt(slot.dataset.slot);
                const item = this.inventory.at(idx);
                if (!item) return;

                sfx.init();

                if (e.shiftKey) {
                    const shopOpen = !document.getElementById('shop-panel').classList.contains('hidden');
                    if (shopOpen) {
                        // Shift + Click while shop is open: sell for gold
                        const rarityMult = { normal: 1, magic: 3, rare: 6, unique: 12 }[item.rarity] || 1;
                        const sellPrice = Math.max(5, Math.floor((item.value || 0) * rarityMult));
                        this.inventory[idx] = null;
                        if (this.selectedGemIdx === idx) this.selectedGemIdx = null;
                        this.player.gold += sellPrice;
                        sfx.playPotion();
                        this.floaters.add(this.player.x, this.player.y - 15, `판매 +${sellPrice} G`, "#ffd700");
                    } else if (confirm(`'${item.name}'을(를) 파괴하시겠습니까?`)) {
                        // Shift + Click: Destroy item
                        this.inventory[idx] = null;
                        if (this.selectedGemIdx === idx) this.selectedGemIdx = null;
                        sfx.playMonsterDeath();
                        this.floaters.add(this.player.x, this.player.y - 15, "파괴됨", "#ff5555");
                    }
                } else {
                    // Regular Click
                    if (item.type === 'gem') {
                        if (this.selectedGemIdx === idx) {
                            this.selectedGemIdx = null;
                            this.floaters.add(this.player.x, this.player.y - 15, "보석 선택 해제", "#aaaaaa");
                        } else {
                            this.selectedGemIdx = idx;
                            this.floaters.add(this.player.x, this.player.y - 15, "소켓이 있는 장비를 클릭하세요", item.color);
                        }
                    } else if (item.slot === 'potion') {
                        if (item.subtype === 'mana') {
                            this.player.manaPotions.push(item.value);
                        } else {
                            this.player.potions.push(item.value);
                        }
                        this.inventory[idx] = null;
                        sfx.playPotion();
                        this.floaters.add(this.player.x, this.player.y - 15, `${item.name} 등록`, item.subtype === 'mana' ? "#3a8fff" : "#00ff00");
                    } else if (this.selectedGemIdx !== null) {
                        // Socket the selected gem into this equipment
                        const gem = this.inventory.at(this.selectedGemIdx);
                        if (gem && item.sockets && (item.gems ? item.gems.length : 0) < item.sockets) {
                            if (!item.gems) item.gems = [];
                            item.gems.push(gem);
                            item.stat += `\n${gem.name}: ${gem.stat.replace('소켓 장착 시: ', '')}`;
                            this.inventory[this.selectedGemIdx] = null;
                            sfx.playPotion();
                            this.floaters.add(this.player.x, this.player.y - 15, `${gem.name} 소켓 장착!`, gem.color);
                        } else {
                            sfx.playHit();
                            this.floaters.add(this.player.x, this.player.y - 15, "빈 소켓이 없습니다!", "#ff5555");
                        }
                        this.selectedGemIdx = null;
                    } else {
                        // Weapon/Armor Equip Toggle
                        if (item.equipped) {
                            item.equipped = false;
                            sfx.playMonsterDeath(); 
                            this.floaters.add(this.player.x, this.player.y - 15, "장착 해제", "#aaaaaa");
                        } else {
                            if (this.player.level < (item.reqLevel || 1)) {
                                sfx.playHit();
                                this.floaters.add(this.player.x, this.player.y - 15, "레벨 부족!", "#ff3333");
                                return;
                            }
                            // Unequip any other item of the same slot first
                            this.inventory.forEach(otherItem => {
                                if (otherItem && otherItem.slot === item.slot) {
                                    otherItem.equipped = false;
                                }
                            });
                            item.equipped = true;
                            sfx.playPotion(); 
                            this.floaters.add(this.player.x, this.player.y - 15, "장착됨!", "#d4af37");
                        }
                    }
                }
                
                this.syncInventoryUI();
                this.player.recalculateStats(this.inventory);
                this.updateUI();
                slot.dispatchEvent(new Event('mouseenter'));
            });
        });
    }

    setupInputs() {
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const dir = e.deltaY > 0 ? -0.15 : 0.15;
            this.zoom = Math.min(2.4, Math.max(1.0, this.zoom + dir));
        }, { passive: false });

        this.canvas.addEventListener('mousedown', e => {
            if (!this.isGameRunning) return;
            sfx.init();

            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            this.mouse.isDown = true;
            this.mouse.button = e.button;

            if (e.button === 0) {
                this.handleLeftClick(clickX, clickY);
            } else if (e.button === 2) {
                this.handleRightClick(clickX, clickY);
            }
        });

        this.canvas.addEventListener('mousemove', e => {
            if (!this.isGameRunning) return;
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;

            if (this.mouse.isDown && this.mouse.button === 0 && this.player.state !== 'attack') {
                const cartDest = this.screenToCartesian(this.mouse.x, this.mouse.y);
                this.moveTowards(cartDest.x, cartDest.y);
            }
        });

        window.addEventListener('mouseup', () => {
            this.mouse.isDown = false;
            this.mouse.button = -1;
        });

        window.addEventListener('keydown', e => {
            sfx.init();
            const code = e.code;
            const key = e.key.toUpperCase();
            if (code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD') {
                if (this.isGameRunning) this.keys[code[3]] = true; // 'W','A','S','D'
            } else if (code === 'Comma' || key === ',' || key === '<') {
                if (this.isGameRunning) this.triggerMeleeKey();
            } else if (code === 'Period' || key === '.' || key === '>') {
                if (this.isGameRunning) this.triggerSkillKey();
            } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4') {
                if (this.isGameRunning) this.selectSkill(parseInt(code.slice(5)) - 1);
            } else if (code === 'KeyQ' || key === 'Q') {
                this.triggerPotion();
            } else if (code === 'KeyR' || key === 'R') {
                this.triggerManaPotion();
            } else if (code === 'KeyI' || key === 'I') {
                document.getElementById('inventory-panel').classList.toggle('hidden');
            } else if (code === 'KeyC' || key === 'C') {
                document.getElementById('stats-panel').classList.toggle('hidden');
            } else if (code === 'KeyK' || key === 'K') {
                document.getElementById('skills-panel').classList.toggle('hidden');
            } else if (code === 'KeyM' || key === 'M') {
                const mmEl = document.getElementById('minimap');
                if (mmEl) mmEl.classList.toggle('hidden');
            } else if (code === 'KeyT' || key === 'T') {
                this.triggerTownPortal();
            } else if (code === 'KeyF' || key === 'F') {
                if (this.isGameRunning) this.triggerAltar();
            }
        });

        window.addEventListener('keyup', e => {
            const code = e.code;
            if (code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD') {
                this.keys[code[3]] = false; // 'W','A','S','D'
            }
        });

        // Drop held movement keys when the window loses focus
        window.addEventListener('blur', () => {
            this.keys = {};
        });
    }

    // Converts held WASD keys (screen directions) into isometric world
    // movement each frame; releasing all keys stops the player.
    processKeyboardMovement() {
        this.playerMovement.processKeyboardMovement(this.keys);
    }

    moveTowards(tx, ty) {
        this.playerMovement.moveTowards(tx, ty);
    }

    hasLineOfSight(x0, y0, x1, y1) {
        return this.playerMovement.hasLineOfSight(x0, y0, x1, y1);
    }

    triggerPotion() {
        if (this.castTimer > 0 || !this.isGameRunning) return;
        if (this.player.potions.length <= 0 || this.player.hp >= this.player.maxHp) return;
        this.castTimer = 30;
        this.maxCastTimer = 30;
        this.castName = '체력 물약 마시는 중...';
        const playerRef = this.player;
        const floatersRef = this.floaters;
        const self = this;
        this.castAction = function() {
            const healed = playerRef.usePotion();
            if (healed > 0) {
                sfx.playPotion();
                floatersRef.add(playerRef.x, playerRef.y - 15, `+${healed} HP`, "#00ff00");
                self.updateUI();
            }
        };
    }

    triggerManaPotion() {
        if (this.castTimer > 0 || !this.isGameRunning) return;
        if (this.player.manaPotions.length <= 0 || this.player.mp >= this.player.maxMp) return;
        this.castTimer = 30;
        this.maxCastTimer = 30;
        this.castName = '마나 물약 마시는 중...';
        const playerRef = this.player;
        const floatersRef = this.floaters;
        const self = this;
        this.castAction = function() {
            const restored = playerRef.useManaPotion();
            if (restored > 0) {
                sfx.playPotion();
                floatersRef.add(playerRef.x, playerRef.y - 15, `+${restored} MP`, "#3a8fff");
                self.updateUI();
            }
        };
    }

    handleLeftClick(sx, sy) {
        const v = this.screenToVirtual(sx, sy);
        if (this.currentMap === 'town') {
            const isoCam = this.camera.getIsoOffset();
            const npcIso = this.map.worldToIso(this.npc.x, this.npc.y);
            const npx = npcIso.x - isoCam.x + this.canvas.width / 2;
            const npy = npcIso.y - isoCam.y + this.canvas.height / 2;

            if (Math.hypot(v.x - npx, v.y - npy) < 32) {
                const dx = this.npc.x - this.player.x;
                const dy = this.npc.y - this.player.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 64) {
                    const shopPanel = document.getElementById('shop-panel');
                    if (shopPanel) {
                        shopPanel.classList.toggle('hidden');
                        sfx.playPotion();
                    }
                } else {
                    this.moveTowards(this.npc.x, this.npc.y);
                    this.floaters.add(this.player.x, this.player.y - 15, "아카라에게 다가갑니다...", "#aaaaaa");
                }
                return;
            }
        }

        const cartDest = this.screenToCartesian(sx, sy);
        let clickedMonster = null;
        for (const m of this.monsters) {
            if (m.state === 'death') continue;
            
            const isoCam = this.camera.getIsoOffset();
            const mIso = this.map.worldToIso(m.x, m.y);
            const msx = mIso.x - isoCam.x + this.canvas.width / 2;
            const msy = mIso.y - isoCam.y + this.canvas.height / 2;

            if (Math.hypot(v.x - msx, v.y - msy) < 32 * (m.scale || 1)) {
                clickedMonster = m;
                break;
            }
        }

        if (clickedMonster) {
            const dist = Math.hypot(clickedMonster.x - this.player.x, clickedMonster.y - this.player.y);
            if (dist <= this.player.attackRange) {
                this.combat.attackMonster(clickedMonster);
            } else {
                this.moveTowards(clickedMonster.x, clickedMonster.y);
            }
        } else {
            this.moveTowards(cartDest.x, cartDest.y);
        }
    }

    handleRightClick(sx, sy) {
        const cartDest = this.screenToCartesian(sx, sy);
        this.combat.castSkill(this.player.activeSkill, cartDest.x, cartDest.y);
    }

    selectSkill(index) {
        const key = this.player.skillAccess[index];
        if (!key) return;
        if ((this.player.skills[key] || 0) === 0) {
            this.floaters.add(this.player.x, this.player.y - 15, `${SKILLS[key].name}: 미습득`, "#888888");
            return;
        }
        this.player.activeSkill = key;
        this.floaters.add(this.player.x, this.player.y - 15, `${SKILLS[key].name} 선택`, SKILLS[key].color);
        sfx.playPotion();
        this.updateUI();
    }

    triggerMeleeKey() {
        const target = this.combat.findNearestMonster(this.player.attackRange);
        if (target) {
            this.combat.attackMonster(target);
        } else if (this.player.meleeAttack()) {
            sfx.playSlash();
        }
    }

    triggerSkillKey() {
        const key = this.player.activeSkill;
        const def = SKILLS[key];
        if (def && def.kind === 'melee_aoe') {
            this.combat.castSkill(key, this.player.x, this.player.y);
            return;
        }
        const target = this.combat.findNearestMonster(600);
        if (target) {
            this.combat.castSkill(key, target.x, target.y);
        } else {
            const angle = this.player.direction * (Math.PI / 4);
            this.combat.castSkill(
                key,
                this.player.x + Math.cos(angle) * 120,
                this.player.y + Math.sin(angle) * 120
            );
        }
    }

    // Converts raw screen coords into the unzoomed (virtual) screen space
    // that all world->screen math operates in.
    screenToVirtual(sx, sy) {
        const hw = this.canvas.width / 2;
        const hh = this.canvas.height / 2;
        return {
            x: (sx - hw) / this.zoom + hw,
            y: (sy - hh) / this.zoom + hh
        };
    }

    screenToCartesian(sx, sy) {
        const v = this.screenToVirtual(sx, sy);
        const isoCam = this.camera.getIsoOffset();
        const halfWidth = this.canvas.width / 2;
        const halfHeight = this.canvas.height / 2;
        const isoX = v.x - halfWidth + isoCam.x;
        const isoY = v.y - halfHeight + isoCam.y;
        return this.map.isoToWorld(isoX, isoY);
    }

    applyZoom() {
        const hw = this.canvas.width / 2;
        const hh = this.canvas.height / 2;
        this.ctx.save();
        this.ctx.translate(hw, hh);
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-hw, -hh);
    }

    // World coords -> final on-screen pixels (zoom applied), for screen-space
    // passes like lighting and the occlusion check
    worldToScreen(wx, wy) {
        const isoCam = this.camera.getIsoOffset();
        const hw = this.canvas.width / 2;
        const hh = this.canvas.height / 2;
        const vx = (wx - wy) - isoCam.x + hw;
        const vy = (wx + wy) * 0.5 - isoCam.y + hh;
        return {
            x: hw + (vx - hw) * this.zoom,
            y: hh + (vy - hh) * this.zoom
        };
    }

    buildDungeonProps(map) {
        const props = [];
        const t = map.tileSize;
        const stairs = map.stairsPoint;

        map.rooms.forEach((room, i) => {
            // torches on two random inner corners of every room
            const corners = [
                [room.c, room.r],
                [room.c + room.w - 1, room.r],
                [room.c, room.r + room.h - 1],
                [room.c + room.w - 1, room.r + room.h - 1]
            ].sort(() => Math.random() - 0.5);
            corners.slice(0, 2).forEach(([cc, rr]) => {
                const pos = map.tileToWorld(cc, rr);
                props.push(new Prop(pos.x, pos.y, 'torch'));
            });

            // centerpiece for rooms other than the spawn room
            if (i > 0 && room.w >= 5 && room.h >= 5) {
                const centerPos = map.tileToWorld(
                    room.c + Math.floor(room.w / 2),
                    room.r + Math.floor(room.h / 2)
                );
                if (Math.hypot(centerPos.x - stairs.x, centerPos.y - stairs.y) > t) {
                    const roll = Math.random();
                    if (roll < 0.35) {
                        props.push(new Prop(centerPos.x, centerPos.y, 'sarcophagus'));
                    } else if (roll < 0.6) {
                        const leftPos = map.tileToWorld(room.c + 1, room.r + Math.floor(room.h / 2));
                        const rightPos = map.tileToWorld(room.c + room.w - 2, room.r + Math.floor(room.h / 2));
                        props.push(new Prop(leftPos.x, leftPos.y, 'pillar'));
                        props.push(new Prop(rightPos.x, rightPos.y, 'pillar'));
                    }
                }
            }
        });

        // scattered debris on random floor tiles, away from spawn and stairs
        for (let k = 0; k < 10; k++) {
            const c = 2 + Math.floor(Math.random() * (map.cols - 4));
            const r = 2 + Math.floor(Math.random() * (map.rows - 4));
            const pos = map.tileToWorld(c, r);
            if (map.grid[r][c] !== 0) continue;
            if (Math.hypot(pos.x - map.spawnPoint.x, pos.y - map.spawnPoint.y) < t * 2) continue;
            if (Math.hypot(pos.x - stairs.x, pos.y - stairs.y) < t * 1.5) continue;
            props.push(new Prop(pos.x, pos.y, Math.random() < 0.5 ? 'bones' : 'jar'));
        }

        // Special interactables: a treasure chest, a blood altar, and traps.
        // Place the chest/altar in distinct non-spawn rooms.
        const sideRooms = map.rooms.slice(1).filter(room =>
            Math.hypot(map.tileToWorld(room.c + room.w / 2, room.r + room.h / 2).x - stairs.x,
                       map.tileToWorld(room.c + room.w / 2, room.r + room.h / 2).y - stairs.y) > t * 1.5
        );
        const shuffled = sideRooms.sort(() => Math.random() - 0.5);
        if (shuffled[0]) {
            const cpos = map.tileToWorld(shuffled[0].c + shuffled[0].w / 2 - 0.5, shuffled[0].r + 1);
            const chest = new Prop(cpos.x, cpos.y, 'chest');
            chest.opened = false;
            props.push(chest);
        }
        if (shuffled[1]) {
            const apos = map.tileToWorld(shuffled[1].c + shuffled[1].w / 2 - 0.5, shuffled[1].r + 1);
            const altar = new Prop(apos.x, apos.y, 'altar');
            altar.used = false;
            props.push(altar);
        }

        // Telegraphed spike traps on a handful of floor tiles
        const trapTarget = 4 + Math.floor(Math.random() * 3);
        let placed = 0;
        let trapAttempts = 0;
        while (placed < trapTarget && trapAttempts < 200) {
            trapAttempts++;
            const c = 2 + Math.floor(Math.random() * (map.cols - 4));
            const r = 2 + Math.floor(Math.random() * (map.rows - 4));
            if (map.grid[r][c] !== 0) continue;
            const pos = map.tileToWorld(c, r);
            if (Math.hypot(pos.x - map.spawnPoint.x, pos.y - map.spawnPoint.y) < t * 3) continue;
            if (Math.hypot(pos.x - stairs.x, pos.y - stairs.y) < t * 1.5) continue;
            const trap = new Prop(pos.x, pos.y, 'trap');
            trap.cooldown = 0;
            props.push(trap);
            placed++;
        }

        props.push(new Prop(stairs.x, stairs.y, 'stairs'));
        return props;
    }

    buildTownProps() {
        const props = [];
        const map = this.townMap;
        const at = (c, r, type) => {
            const pos = map.tileToWorld(c, r);
            props.push(new Prop(pos.x, pos.y, type));
        };

        // houses sit on the solid footprints marked in generateTown
        map.houseSpots.forEach(spot => {
            const pos = map.tileToWorld(spot.c + spot.w / 2 - 0.5, spot.r + spot.h / 2 - 0.5);
            props.push(new Prop(pos.x, pos.y, 'house'));
        });

        at(11, 9, 'well');
        at(5, 8, 'campfire');
        at(10, 4, 'crate');
        at(12, 5, 'crate');
        [3, 4, 5].forEach(c => at(c, 12, 'fence'));
        [10, 11, 12].forEach(c => at(c, 12, 'fence'));
        return props;
    }

    initParticles() {
        const particles = [];
        for (let i = 0; i < 28; i++) {
            particles.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: (Math.random() - 0.5) * 0.2,
                vy: -0.15 - Math.random() * 0.25,
                size: 1 + Math.random() * 1.6,
                alpha: 0.12 + Math.random() * 0.25,
                phase: Math.random() * Math.PI * 2
            });
        }
        return particles;
    }

    updateParticles() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.phase += 0.03;
            if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
            if (p.x < -10) p.x = w + 10;
            if (p.x > w + 10) p.x = -10;
        }
    }

    renderParticles() {
        const ctx = this.ctx;
        const ember = this.currentMap === 'dungeon';
        ctx.save();
        for (const p of this.particles) {
            const twinkle = p.alpha * (0.6 + Math.sin(p.phase) * 0.4);
            ctx.fillStyle = ember
                ? `rgba(255, 150, 70, ${twinkle})`
                : `rgba(190, 230, 150, ${twinkle * 0.8})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Darkness overlay with light holes punched out (dungeon only)
    renderLighting() {
        if (this.currentMap !== 'dungeon') return;

        if (!this.lightCanvas) {
            this.lightCanvas = document.createElement('canvas');
        }
        if (this.lightCanvas.width !== this.canvas.width || this.lightCanvas.height !== this.canvas.height) {
            this.lightCanvas.width = this.canvas.width;
            this.lightCanvas.height = this.canvas.height;
        }

        const lctx = this.lightCanvas.getContext('2d');
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, this.lightCanvas.width, this.lightCanvas.height);
        lctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
        lctx.fillRect(0, 0, this.lightCanvas.width, this.lightCanvas.height);

        const lights = [];
        const pPos = this.worldToScreen(this.player.x, this.player.y);
        lights.push({ x: pPos.x, y: pPos.y - 30 * this.zoom, r: 290 });

        for (const proj of this.projectiles) {
            const pos = this.worldToScreen(proj.x, proj.y);
            lights.push({ x: pos.x, y: pos.y, r: 80 + proj.level * 6 });
        }
        if (this.dungeonPortal) {
            const pos = this.worldToScreen(this.dungeonPortal.x, this.dungeonPortal.y);
            lights.push({ x: pos.x, y: pos.y, r: 130 });
        }
        for (const prop of this.props) {
            const r = prop.lightRadius();
            if (r > 0) {
                const pos = this.worldToScreen(prop.x, prop.y);
                lights.push({ x: pos.x, y: pos.y - 28 * this.zoom, r });
            }
        }

        lctx.globalCompositeOperation = 'destination-out';
        for (const light of lights) {
            const radius = light.r * this.zoom;
            const grad = lctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
            grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.75)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            lctx.fillStyle = grad;
            lctx.beginPath();
            lctx.arc(light.x, light.y, radius, 0, Math.PI * 2);
            lctx.fill();
        }
        lctx.globalCompositeOperation = 'source-over';

        this.ctx.drawImage(this.lightCanvas, 0, 0);
    }

    // Collect on-screen wall tiles as depth-sorted drawables; walls covering
    // the player turn translucent so they never hide the hero
    collectWallEntities(entities) {
        const map = this.map;
        const isoCam = this.camera.getIsoOffset();
        const hw = this.canvas.width / 2;
        const hh = this.canvas.height / 2;

        const pIso = { x: this.player.x - this.player.y, y: (this.player.x + this.player.y) * 0.5 };
        const px = pIso.x - isoCam.x + hw;
        const py = pIso.y - isoCam.y + hh;
        const playerDepth = this.player.x + this.player.y;

        for (let r = 0; r < map.rows; r++) {
            for (let c = 0; c < map.cols; c++) {
                if (map.grid[r][c] !== 1) continue;

                const cartX = c * map.tileSize + map.tileSize / 2;
                const cartY = r * map.tileSize + map.tileSize / 2;
                const sx = (cartX - cartY) - isoCam.x + hw;
                const sy = (cartX + cartY) * 0.5 - isoCam.y + hh;

                const buffer = 160;
                if (sx < -buffer || sx > this.canvas.width + buffer ||
                    sy < -buffer || sy > this.canvas.height + buffer) {
                    continue;
                }

                const depth = cartX + cartY;
                let alpha = 1;
                if (depth > playerDepth && Math.abs(sx - px) < 72 && sy - py > -8 && sy - py < 100) {
                    alpha = 0.4;
                }

                entities.push({
                    depth,
                    render: () => map.renderWallTile(this.ctx, sx, sy, r, c, alpha)
                });
            }
        }
    }

    descendStairs() {
        this.floor++;
        this.dungeonMap = new TileMap(64, 'dungeon', this.floor);
        this.map = this.dungeonMap;
        this.playerMovement.setMap(this.map);
        this.monsters = [];
        this.projectiles = [];
        this.enemyProjectiles = [];
        this.effects = [];
        this.dungeonPortal = null;
        this.townPortal = null;
        this.props = this.buildDungeonProps(this.dungeonMap);

        const spawn = this.dungeonMap.spawnPoint;
        this.player.x = spawn.x;
        this.player.y = spawn.y;
        this.player.targetX = spawn.x;
        this.player.targetY = spawn.y;
        this.camera.x = spawn.x;
        this.camera.y = spawn.y;

        sfx.playBossSpawn();
        this.floaters.add(this.player.x, this.player.y - 20, `지하 ${this.floor}층`, '#ffcc44');
        this.spawnInitialMonsters();

        // Boss floors: a boss rules this floor and seals the stairs
        if (this.floor % BOSS_FLOOR_INTERVAL === 0) {
            this.spawnBoss();
            this.floaters.add(this.player.x, this.player.y - 50, "보스를 처치하기 전엔 내려갈 수 없습니다!", '#ff5555');
        }

        this.updateUI();
    }

    // Reveal minimap tiles around the player (fog of war)
    updateExploration() {
        const map = this.map;
        const pc = Math.floor(this.player.x / map.tileSize);
        const pr = Math.floor(this.player.y / map.tileSize);
        for (let dr = -5; dr <= 5; dr++) {
            for (let dc = -5; dc <= 5; dc++) {
                const r = pr + dr;
                const c = pc + dc;
                if (r >= 0 && r < map.rows && c >= 0 && c < map.cols) {
                    map.explored[r][c] = true;
                }
            }
        }
    }

    renderMinimap() {
        if (!this.minimapCtx) return;
        const mm = this.minimapCtx;
        const size = mm.canvas.width;
        mm.clearRect(0, 0, size, size);
        if (!this.isGameRunning) return;

        const map = this.map;
        const px = size / Math.max(map.cols, map.rows);
        const isTown = this.currentMap === 'town';

        for (let r = 0; r < map.rows; r++) {
            for (let c = 0; c < map.cols; c++) {
                if (!map.explored[r][c]) continue;
                if (map.grid[r][c] === 1) {
                    mm.fillStyle = isTown ? 'rgba(90, 140, 90, 0.7)' : 'rgba(185, 165, 135, 0.6)';
                } else {
                    mm.fillStyle = isTown ? 'rgba(50, 90, 50, 0.4)' : 'rgba(110, 100, 85, 0.28)';
                }
                mm.fillRect(c * px, r * px, px + 0.5, px + 0.5);
            }
        }

        const dot = (wx, wy, color, s) => {
            mm.fillStyle = color;
            mm.fillRect(wx / map.tileSize * px - s / 2, wy / map.tileSize * px - s / 2, s, s);
        };

        if (!isTown) {
            const stairs = map.stairsPoint;
            const sc = Math.floor(stairs.x / map.tileSize);
            const sr = Math.floor(stairs.y / map.tileSize);
            if (map.explored[sr] && map.explored[sr][sc]) {
                const sealed = this.monsters.some(m => m.rank === 'boss' && m.state !== 'death');
                dot(stairs.x, stairs.y, sealed ? '#ff4444' : '#ffcc44', 5);
            }

            if (this.dungeonPortal) dot(this.dungeonPortal.x, this.dungeonPortal.y, '#00ffff', 4);

            for (const m of this.monsters) {
                if (m.state === 'death') continue;
                const mc = Math.floor(m.x / map.tileSize);
                const mr = Math.floor(m.y / map.tileSize);
                if (mr < 0 || mr >= map.rows || mc < 0 || mc >= map.cols || !map.explored[mr][mc]) continue;
                if (m.rank === 'boss') dot(m.x, m.y, '#ff2200', 5);
                else if (m.rank === 'champion') dot(m.x, m.y, '#66aaff', 3);
                else dot(m.x, m.y, '#ff5555', 2.5);
            }
        } else {
            if (this.townPortal) dot(this.townPortal.x, this.townPortal.y, '#00ffff', 4);
            dot(this.npc.x, this.npc.y, '#d4af37', 4);
        }

        dot(this.player.x, this.player.y, '#ffffff', 4);

        mm.fillStyle = 'rgba(224, 216, 207, 0.9)';
        mm.font = 'bold 11px sans-serif';
        mm.textAlign = 'left';
        mm.fillText(isTown ? '마을' : `지하 ${this.floor}층`, 6, size - 6);
    }

    spawnInitialMonsters() {
        this.monsterFactory.spawnInitialMonsters();
    }

    spawnMonster() {
        this.monsterFactory.spawnMonster();
    }

    // Chests auto-open and traps auto-trigger on contact; altars wait for F.
    handleInteractables() {
        for (const prop of this.props) {
            const d = Math.hypot(this.player.x - prop.x, this.player.y - prop.y);

            if (prop.type === 'chest' && !prop.opened && d < 36) {
                prop.opened = true;
                sfx.playLevelUp();
                const gold = Math.floor(40 * this.floor * (1 + Math.random()));
                this.player.gold += gold;
                this.floaters.add(prop.x, prop.y - 20, `보물 상자! +${gold} G`, '#ffd700');
                const drops = 2 + (Math.random() < 0.5 ? 1 : 0);
                for (let i = 0; i < drops; i++) this.lootItem(this.floor * 2, true);
                this.updateUI();
            } else if (prop.type === 'trap') {
                if (prop.cooldown > 0) prop.cooldown--;
                if (prop.cooldown === 0 && d < 22) {
                    prop.cooldown = 150; // spikes show (>100) then re-arm
                    const dmg = Math.max(5, Math.floor(this.player.maxHp * 0.12));
                    this.floaters.add(prop.x, prop.y - 14, '함정!', '#ff6644');
                    this.damagePlayer(dmg);
                    if (!this.isGameRunning) return;
                }
            } else if (prop.type === 'altar' && !prop.used) {
                if (d < 40 && this.altarMsgCooldown <= 0) {
                    this.altarMsgCooldown = 90;
                    this.floaters.add(prop.x, prop.y - 22, 'F: 피의 제단 (체력 30% → 공격력 영구 +15%)', '#ff6666');
                }
            }
        }
        if (this.altarMsgCooldown > 0) this.altarMsgCooldown--;
    }

    triggerAltar() {
        if (!this.isGameRunning || this.currentMap !== 'dungeon') return;
        const altar = this.props.find(p => p.type === 'altar' && !p.used &&
            Math.hypot(this.player.x - p.x, this.player.y - p.y) < 40);
        if (!altar) return;
        if (this.player.hp < this.player.maxHp * 0.35) {
            this.floaters.add(this.player.x, this.player.y - 15, '체력이 부족합니다', '#ff5555');
            sfx.playHit();
            return;
        }
        altar.used = true;
        const cost = Math.floor(this.player.hp * 0.3);
        this.player.hp = Math.max(1, this.player.hp - cost);
        this.player.baseAtk = Math.floor(this.player.baseAtk * 1.15);
        this.player.recalculateStats(this.inventory);
        sfx.playLevelUp();
        this.floaters.add(this.player.x, this.player.y - 20, '피의 계약! 공격력 영구 +15%', '#ff3344');
        this.updateUI();
    }

    // Which boss rules a given boss floor (cycles, getting nastier with depth)
    bossTypeForFloor(floor) {
        return this.monsterFactory.bossTypeForFloor(floor);
    }

    spawnBoss() {
        return this.monsterFactory.spawnBoss();
    }

    handleMonsterKill(monster) {
        sfx.playMonsterDeath();
        this.player.kills++;

        // Award gold based on monster level and rank
        const goldDropped = Math.floor(monster.level * (5 + Math.random() * 5) * (monster.goldMult || 1));
        this.player.gold += goldDropped;
        this.floaters.add(monster.x, monster.y - 10, `+${goldDropped} G`, '#ffd700');

        const isLeveledUp = this.player.gainExp(monster.expValue);
        if (isLeveledUp) {
            sfx.playLevelUp();
            this.triggerLevelUpBanner();
        }

        this.player.recalculateStats(this.inventory);
        this.updateUI();

        if (monster.rank === 'boss') {
            this.floaters.add(monster.x, monster.y - 25, `${monster.name} 처치!`, '#ff5500');
            for (let i = 0; i < 3; i++) {
                this.lootItem(monster.level, true);
            }
        } else if (monster.rank === 'champion') {
            this.lootItem(monster.level);
        } else if (Math.random() < 0.35) {
            this.lootItem(monster.level);
        }

        const gemChance = monster.rank === 'normal' ? 0.08 : 0.25;
        if (Math.random() < gemChance) {
            this.lootGem();
        }

        if (monster.rank === 'boss') {
            this.floaters.add(this.player.x, this.player.y - 30, "계단의 봉인이 풀렸습니다!", '#ffcc44');
        }

        // Slimes split into two smaller slimes on death (one generation only)
        if (monster.kind === 'slime' && monster.splitGen < 1 && this.monsters.length < MAX_MONSTERS + 4) {
            for (let i = 0; i < 2; i++) {
                const ang = Math.random() * Math.PI * 2;
                const child = new Monster(
                    monster.x + Math.cos(ang) * 18,
                    monster.y + Math.sin(ang) * 18,
                    Math.max(1, monster.level - 1),
                    'normal',
                    'slime'
                );
                child.splitGen = monster.splitGen + 1;
                child.scale = 0.65;
                child.radius = 8;
                child.maxHp = Math.max(1, Math.floor(monster.maxHp * 0.35));
                child.hp = child.maxHp;
                child.expValue = Math.floor(monster.expValue * 0.3);
                child.goldMult = 0;
                this.monsters.push(child);
            }
            this.floaters.add(monster.x, monster.y - 20, "분열!", '#3fb86e');
        }
    }

    lootGem() {
        const gemType = GEM_TYPES.at(Math.floor(Math.random() * GEM_TYPES.length));

        const slotIdx = this.inventory.indexOf(null);
        if (slotIdx === -1) {
            this.floaters.add(this.player.x, this.player.y - 25, "인벤토리 가득 참!", "#ff5555");
            return;
        }

        const gem = {
            name: gemType.name,
            type: 'gem',
            slot: 'gem',
            stat: gemType.stat,
            value: 0,
            rarity: 'magic',
            color: gemType.color,
            effect: { ...gemType.effect },
            reqLevel: 1
        };
        this.inventory[slotIdx] = gem;
        this.floaters.add(this.player.x, this.player.y - 25, `${gemType.name} 획득!`, gemType.color);

        this.syncInventoryUI();
        this.updateUI();
    }

    syncInventoryUI() {
        const slots = document.querySelectorAll('.inv-slot');
        slots.forEach((slot, i) => {
            const item = this.inventory.at(i);
            slot.draggable = !!item; // only occupied slots can be dragged
            if (item) {
                slot.classList.add('occupied');
                if (item.slot === 'weapon') {
                    slot.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; transform: rotate(45deg);">🗡️</div>`;
                } else if (item.slot === 'shield') {
                    slot.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px;">🛡️</div>`;
                } else if (item.slot === 'helmet') {
                    slot.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px;">🪖</div>`;
                } else if (item.slot === 'chest') {
                    slot.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px;">🧥</div>`;
                } else if (item.slot === 'potion') {
                    const manaGlow = item.subtype === 'mana' ? ' filter: drop-shadow(0 0 4px #3a8fff);' : '';
                    slot.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px;${manaGlow}">🧪</div>`;
                } else if (item.type === 'gem') {
                    slot.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; filter: drop-shadow(0 0 4px ${item.color});">💎</div>`;
                }

                if (item.equipped) {
                    slot.style.borderColor = '#d4af37'; 
                    slot.style.boxShadow = `inset 0 0 8px ${item.color}, 0 0 10px ${item.color}`;
                    const badge = document.createElement('span');
                    badge.style.position = 'absolute';
                    badge.style.top = '2px';
                    badge.style.right = '4px';
                    badge.style.fontSize = '10px';
                    badge.style.color = '#d4af37';
                    badge.style.fontWeight = 'bold';
                    badge.style.textShadow = '1px 1px 2px #000';
                    badge.textContent = 'E';
                    slot.appendChild(badge);
                } else if (this.player.level < (item.reqLevel || 1)) {
                    slot.style.borderColor = '#ff3333';
                    slot.style.boxShadow = 'inset 0 0 10px rgba(255, 0, 0, 0.4)';
                } else {
                    slot.style.borderColor = item.color;
                    slot.style.boxShadow = '';
                }

                if (this.selectedGemIdx === i) {
                    slot.style.borderColor = '#ffffff';
                    slot.style.boxShadow = `0 0 12px ${item.color}`;
                }
            } else {
                slot.classList.remove('occupied');
                slot.style.borderColor = '';
                slot.style.boxShadow = '';
                slot.innerHTML = '';
            }
        });
    }

    lootItem(mLvl = 1, boosted = false) {
        // 1. Roll rarity (boosted rolls — boss drops — are always magic or better)
        const roll = boosted ? 0.7 + Math.random() * 0.3 : Math.random();
        let rarity = 'normal';
        let color = '#b0a89f';
        
        if (roll < 0.70) {
            rarity = 'normal';
            color = '#b0a89f';
        } else if (roll < 0.90) {
            rarity = 'magic';
            color = '#00ffcc';
        } else if (roll < 0.98) {
            rarity = 'rare';
            color = '#ffff00';
        } else {
            rarity = 'unique';
            color = '#ff5500';
        }

        // 2. Select base item or unique item template
        let itemTemplate = null;
        if (rarity === 'unique') {
            const uniques = ITEM_POOL.filter(i => i.rarity === 'unique');
            if (uniques.length > 0) {
                itemTemplate = uniques.at(Math.floor(Math.random() * uniques.length));
            }
        } else {
            // Boosted rolls (boss drops, gambling) always yield equipment, not potions
            const normals = ITEM_POOL.filter(i => i.rarity === 'normal' && (!boosted || i.slot !== 'potion'));
            if (normals.length > 0) {
                itemTemplate = normals.at(Math.floor(Math.random() * normals.length));
            }
        }

        if (!itemTemplate) {
            // Fallback if filter failed
            itemTemplate = ITEM_POOL.at(Math.floor(Math.random() * ITEM_POOL.length));
        }

        // Clone item template
        let item = { ...itemTemplate, rarity, color, equipped: false };

        // Determine required level
        let reqLevel = 1;
        if (item.slot !== 'potion') {
            const baseReq = itemTemplate.reqLevel || 1;
            reqLevel = Math.max(baseReq, mLvl + Math.floor(Math.random() * 3) - 1);
        }
        item.reqLevel = reqLevel;

        const scaleMultiplier = 1 + (reqLevel - 1) * 0.15;

        // 3. Apply affixes if magic or rare and not a potion
        if ((rarity === 'magic' || rarity === 'rare') && item.slot !== 'potion') {
            const applicablePrefixes = PREFIXES.filter(p => p.slot.includes(item.slot));
            const applicableSuffixes = SUFFIXES.filter(s => s.slot.includes(item.slot));

            let chosenPrefix = null;
            let chosenSuffix = null;

            if (rarity === 'magic') {
                const typeRoll = Math.random();
                if (typeRoll < 0.4 && applicablePrefixes.length > 0) {
                    chosenPrefix = applicablePrefixes.at(Math.floor(Math.random() * applicablePrefixes.length));
                } else if (typeRoll < 0.8 && applicableSuffixes.length > 0) {
                    chosenSuffix = applicableSuffixes.at(Math.floor(Math.random() * applicableSuffixes.length));
                } else {
                    if (applicablePrefixes.length > 0) chosenPrefix = applicablePrefixes.at(Math.floor(Math.random() * applicablePrefixes.length));
                    if (applicableSuffixes.length > 0) chosenSuffix = applicableSuffixes.at(Math.floor(Math.random() * applicableSuffixes.length));
                }
            } else if (rarity === 'rare') {
                if (applicablePrefixes.length > 0) chosenPrefix = applicablePrefixes.at(Math.floor(Math.random() * applicablePrefixes.length));
                if (applicableSuffixes.length > 0) chosenSuffix = applicableSuffixes.at(Math.floor(Math.random() * applicableSuffixes.length));
            }

            let bonusVal = 0;
            let nameParts = [];

            if (chosenPrefix) {
                nameParts.push(chosenPrefix.name);
                bonusVal += chosenPrefix.value;
            }

            nameParts.push(item.name);

            if (chosenSuffix) {
                nameParts.push(chosenSuffix.name);
                if (chosenSuffix.statType === 'SKILL_FIREBALL') {
                    item.skillFireballBonus = chosenSuffix.value;
                } else {
                    // Suffix stats keep their own type (ATK/HP/MP) instead of
                    // being lumped into the item's primary stat value.
                    item.affixBonus = { type: chosenSuffix.statType, value: chosenSuffix.value };
                }
            }

            item.name = nameParts.join(' ');
            item.value += bonusVal;
        }

        // Scale values for weapons/armors
        if (item.slot !== 'potion') {
            item.value = Math.floor(item.value * scaleMultiplier);

            // Rebuild stat string
            const statParts = [];
            if (itemTemplate.stat.includes('공격력')) {
                item.primaryStat = 'ATK';
                statParts.push(`+${item.value} 공격력`);
            } else if (itemTemplate.stat.includes('MP')) {
                item.primaryStat = 'MP';
                statParts.push(`+${item.value} 최대 MP`);
            } else {
                item.primaryStat = 'HP';
                statParts.push(`+${item.value} 최대 HP`);
            }

            if (item.affixBonus) {
                item.affixBonus.value = Math.floor(item.affixBonus.value * scaleMultiplier);
                const affixLabels = { ATK: '공격력', HP: '최대 HP', MP: '최대 MP' };
                statParts.push(`+${item.affixBonus.value} ${affixLabels[item.affixBonus.type]}`);
            }

            if (item.skillFireballBonus) {
                statParts.push(`+${item.skillFireballBonus} 화염구 레벨`);
            }

            item.stat = statParts.join('\n');
        }

        // Roll sockets for equipment (0-2)
        if (item.slot !== 'potion') {
            const socketRoll = Math.random();
            item.sockets = socketRoll < 0.45 ? 0 : (socketRoll < 0.8 ? 1 : 2);
            item.gems = [];
        }

        // 4. Place in inventory
        let slotIdx = -1;
        for (let i = 0; i < this.inventory.length; i++) {
            if (this.inventory.at(i) === null) {
                slotIdx = i;
                break;
            }
        }

        if (slotIdx !== -1) {
            this.inventory[slotIdx] = item;
            this.floaters.add(this.player.x, this.player.y - 25, `${item.name} 획득!`, item.color);
            
            this.syncInventoryUI();
            this.player.recalculateStats(this.inventory);
            this.updateUI();
        } else {
            this.floaters.add(this.player.x, this.player.y - 25, "인벤토리 가득 참!", "#ff5555");
        }
    }

    triggerLevelUpBanner() {
        const banner = document.getElementById('level-up-banner');
        banner.classList.remove('hidden');
        const newBanner = banner.cloneNode(true);
        // @ts-ignore
        banner.parentNode.replaceChild(newBanner, banner);
        this.floaters.add(this.player.x, this.player.y - 20, "LEVEL UP!", '#d4af37');
    }

    changeMap(newMapType) {
        this.currentMap = newMapType;
        this.map = newMapType === 'town' ? this.townMap : this.dungeonMap;
        this.playerMovement.setMap(this.map);
    }

    triggerTownPortal() {
        if (!this.isGameRunning) return;
        if (this.castTimer > 0) return;
        if (this.currentMap === 'town') {
            this.floaters.add(this.player.x, this.player.y - 15, "마을에서는 차원문을 열 수 없습니다.", "#00ffff");
            return;
        }

        this.castTimer = 90;
        this.maxCastTimer = 90;
        this.castName = '차원문 여는 중...';
        const self = this;
        this.castAction = function() {
            sfx.playPotion();

            // Spawn portal at player's location in dungeon
            self.dungeonPortal = new Portal(self.player.x, self.player.y, 'town');

            // Spawn portal at town center (8, 8)
            const tx = 8 * self.map.tileSize + self.map.tileSize / 2;
            const ty = 8 * self.map.tileSize + self.map.tileSize / 2;
            self.townPortal = new Portal(tx, ty, 'dungeon');

            self.floaters.add(self.player.x, self.player.y - 15, "차원문이 열렸습니다!", "#00ffff");
        };
    }

    updateUI() {
        const healthPercent = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('health-liquid').style.height = `${healthPercent}%`;
        document.getElementById('health-value').textContent = `${Math.ceil(this.player.hp)}/${this.player.maxHp}`;

        const manaPercent = (this.player.mp / this.player.maxMp) * 100;
        document.getElementById('mana-liquid').style.height = `${manaPercent}%`;
        document.getElementById('mana-value').textContent = `${Math.ceil(this.player.mp)}/${this.player.maxMp}`;

        const xpPercent = (this.player.exp / this.player.nextExp) * 100;
        document.getElementById('xp-fill').style.width = `${xpPercent}%`;

        document.getElementById('hud-level').textContent = this.player.level.toString();
        document.getElementById('potion-count').textContent = this.player.potions.length.toString();
        document.getElementById('mana-potion-count').textContent = this.player.manaPotions.length.toString();

        const goldEl = document.getElementById('stat-gold');
        if (goldEl) {
            goldEl.textContent = `${this.player.gold} G`;
        }

        const buyButtons = document.querySelectorAll('.buy-btn');
        const isInvFull = !this.inventory.includes(null);
        buyButtons.forEach(btn => {
            const itemConfig = SHOP_ITEMS[parseInt(btn.dataset.index)];
            if (!itemConfig) return;
            const price = shopPriceFor(itemConfig.basePrice, this.player.level);
            btn.textContent = `구매 (${price}G)`;
            btn.disabled = (this.player.gold < price || isInvFull);
        });

        const gambleBtn = document.getElementById('gamble-btn');
        if (gambleBtn) {
            const gamblePrice = shopPriceFor(GAMBLE_BASE_PRICE, this.player.level);
            gambleBtn.textContent = `도박 (${gamblePrice}G)`;
            gambleBtn.disabled = (this.player.gold < gamblePrice || isInvFull);
        }

        const floorEl = document.getElementById('stat-floor');
        if (floorEl) {
            floorEl.textContent = this.currentMap === 'town' ? '마을' : `지하 ${this.floor}층`;
        }

        const classEl = document.getElementById('stat-class');
        if (classEl && this.player.classKey) {
            const c = CLASSES[this.player.classKey];
            classEl.textContent = `${c.icon} ${c.name}`;
            classEl.style.color = c.color;
        }

        document.getElementById('stat-level').textContent = this.player.level.toString();
        document.getElementById('stat-atk').textContent = this.player.atk.toString();
        document.getElementById('stat-maxhp').textContent = this.player.maxHp.toString();
        document.getElementById('stat-maxmp').textContent = this.player.maxMp.toString();
        document.getElementById('stat-points').textContent = this.player.statPoints.toString();
        document.getElementById('stat-exp').textContent = `${this.player.exp} / ${this.player.nextExp}`;
        document.getElementById('stat-kills').textContent = this.player.kills.toString();

        const hasPoints = this.player.statPoints > 0;
        document.getElementById('up-atk').disabled = !hasPoints;
        document.getElementById('up-maxhp').disabled = !hasPoints;
        document.getElementById('up-maxmp').disabled = !hasPoints;

        this.updateSkillsPanel();

        // HUD secondary-skill slot reflects the active skill
        const activeDef = SKILLS[this.player.activeSkill];
        const rclickName = document.querySelector('#slot-rclick .slot-name');
        const rclickIcon = document.querySelector('#slot-rclick .slot-icon');
        if (activeDef && rclickName) rclickName.textContent = activeDef.name;
        if (activeDef && rclickIcon) {
            rclickIcon.textContent = activeDef.icon;
            rclickIcon.style.background = 'none';
            rclickIcon.style.boxShadow = 'none';
            rclickIcon.style.fontSize = '18px';
            rclickIcon.style.display = 'flex';
            rclickIcon.style.alignItems = 'center';
            rclickIcon.style.justifyContent = 'center';
        }

        this.syncInventoryUI();
    }

    // One-time build of the skills panel: a row per accessible skill with a
    // select button (set active) and an upgrade button (spend a skill point)
    buildSkillsPanel() {
        const list = document.getElementById('skills-list');
        if (!list) return;
        list.innerHTML = '';
        this.skillRows = {};

        this.player.skillAccess.forEach((key, index) => {
            const def = SKILLS[key];
            const row = document.createElement('div');
            row.className = 'skill-upgrade-group';

            const info = document.createElement('div');
            info.className = 'skill-upgrade-info';
            const name = document.createElement('span');
            name.className = 'skill-upgrade-name';
            name.style.color = def.color;
            name.textContent = `${def.icon} ${def.name}`;
            const lvl = document.createElement('span');
            lvl.className = 'skill-upgrade-level';
            info.appendChild(name);
            info.appendChild(lvl);

            const controls = document.createElement('div');
            controls.className = 'skill-upgrade-controls';
            const desc = document.createElement('span');
            desc.className = 'skill-upgrade-desc';
            const selectBtn = document.createElement('button');
            selectBtn.className = 'gothic-btn skill-select-btn';
            selectBtn.textContent = `선택 (${index + 1})`;
            selectBtn.addEventListener('click', () => this.selectSkill(index));
            const upBtn = document.createElement('button');
            upBtn.className = 'stat-up-btn';
            upBtn.textContent = '+';
            upBtn.addEventListener('click', () => {
                if (this.player.addSkillPoint(key)) {
                    sfx.playPotion();
                    this.updateUI();
                }
            });
            controls.appendChild(desc);
            controls.appendChild(selectBtn);
            controls.appendChild(upBtn);

            row.appendChild(info);
            row.appendChild(controls);
            list.appendChild(row);

            this.skillRows[key] = { lvl, desc, selectBtn, upBtn };
        });
    }

    updateSkillsPanel() {
        const ptsEl = document.getElementById('skill-points');
        if (ptsEl) ptsEl.textContent = this.player.skillPoints.toString();
        if (!this.skillRows) return;

        for (const key of this.player.skillAccess) {
            const row = this.skillRows[key];
            if (!row) continue;
            const def = SKILLS[key];
            const baseLvl = this.player.skills[key] || 0;
            const effLvl = this.player.effectiveSkillLevel(key);
            const isActive = this.player.activeSkill === key;

            if (baseLvl === 0) {
                row.lvl.textContent = '미습득';
                row.desc.textContent = `습득 시 공격력의 ${def.baseMult.toFixed(1)}배 피해`;
                row.selectBtn.disabled = true;
            } else {
                let lvlText = `LV ${baseLvl}`;
                if (effLvl > baseLvl) lvlText += ` (+${effLvl - baseLvl})`;
                row.lvl.textContent = lvlText;
                row.desc.textContent = `공격력의 ${skillMult(key, effLvl).toFixed(1)}배 피해 (마나 ${skillCost(key, effLvl)})`;
                row.selectBtn.disabled = isActive;
            }
            row.selectBtn.textContent = isActive ? '사용 중' : `선택 (${this.player.skillAccess.indexOf(key) + 1})`;
            row.upBtn.disabled = !(this.player.skillPoints > 0 && baseLvl < def.maxLevel);
        }
    }

    // Applies incoming damage to the player and handles the death/reset flow
    damagePlayer(amount) {
        this.combat.damagePlayer(amount);
    }

    // Run-over summary (permadeath: nothing is saved, this is the only reward)
    showGameOver() {
        const elapsedMs = Date.now() - (this.runStartTime || Date.now());
        const totalSec = Math.floor(elapsedMs / 1000);
        const mm = Math.floor(totalSec / 60);
        const ss = totalSec % 60;
        const cls = CLASSES[this.player.classKey];

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('go-class', cls ? `${cls.icon} ${cls.name}` : '-');
        set('go-floor', `지하 ${this.floor}층`);
        set('go-level', `Lv ${this.player.level}`);
        set('go-kills', `${this.player.kills}`);
        set('go-gold', `${this.player.gold} G`);
        set('go-maxhit', `${this.maxHit || 0}`);
        set('go-time', `${mm}분 ${ss}초`);

        const panel = document.getElementById('gameover-panel');
        if (panel) panel.classList.remove('hidden');
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    run() {
        if (!this.isGameRunning) {
            this.camera.update(this.player.x, this.player.y);
            this.props.forEach(p => p.update());
            this.updateParticles();
            this.renderScene();
            requestAnimationFrame(() => this.run());
            return;
        }

        // --- UPDATE STEP ---
        if (this.castTimer > 0) {
            this.player.targetX = this.player.x;
            this.player.targetY = this.player.y;
            this.castTimer--;
            if (this.castTimer <= 0 && this.castAction) {
                this.castAction();
                this.castAction = null;
                this.castName = '';
            }
        }
        this.processKeyboardMovement();
        this.player.update(this.map);
        this.camera.update(this.player.x, this.player.y);

        const activeProps = this.currentMap === 'town' ? this.townProps : this.props;
        activeProps.forEach(p => p.update());
        this.updateParticles();
        this.updateExploration();

        if (this.dungeonPortal) this.dungeonPortal.update();
        if (this.townPortal) this.townPortal.update();
        if (this.currentMap === 'town') {
            this.npc.update();
            const dist = Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y);
            if (dist > 80) {
                const shopPanel = document.getElementById('shop-panel');
                if (shopPanel && !shopPanel.classList.contains('hidden')) {
                    shopPanel.classList.add('hidden');
                }
            }
        } else {
            const shopPanel = document.getElementById('shop-panel');
            if (shopPanel && !shopPanel.classList.contains('hidden')) {
                shopPanel.classList.add('hidden');
            }
        }

        // Check portal collisions
        if (this.currentMap === 'dungeon' && this.dungeonPortal) {
            if (Math.hypot(this.player.x - this.dungeonPortal.x, this.player.y - this.dungeonPortal.y) < 24) {
                this.changeMap('town');
                this.player.x = this.townPortal.x + 32;
                this.player.y = this.townPortal.y + 32;
                this.player.targetX = this.player.x;
                this.player.targetY = this.player.y;
                sfx.playPotion();
                this.floaters.add(this.player.x, this.player.y - 15, "마을 도착", "#00ffff");
            }
        } else if (this.currentMap === 'town' && this.townPortal) {
            if (Math.hypot(this.player.x - this.townPortal.x, this.player.y - this.townPortal.y) < 24) {
                const targetX = this.dungeonPortal.x;
                const targetY = this.dungeonPortal.y;
                this.dungeonPortal = null;
                this.townPortal = null;
                this.changeMap('dungeon');
                this.player.x = targetX + 32;
                this.player.y = targetY + 32;
                this.player.targetX = this.player.x;
                this.player.targetY = this.player.y;
                sfx.playPotion();
                this.floaters.add(this.player.x, this.player.y - 15, "던전 진입", "#ff5500");
            }
        }

        if (this.currentMap === 'dungeon') {
            // Walking onto the stairs descends to a fresh, deeper floor;
            // on boss floors the stairs stay sealed until the boss is dead
            if (this.stairsMsgCooldown > 0) this.stairsMsgCooldown--;
            const stairs = this.map.stairsPoint;
            if (stairs && Math.hypot(this.player.x - stairs.x, this.player.y - stairs.y) < 26) {
                const bossAlive = this.monsters.some(m => m.rank === 'boss' && m.state !== 'death');
                if (bossAlive) {
                    if (this.stairsMsgCooldown <= 0) {
                        this.stairsMsgCooldown = 90;
                        sfx.playHit();
                        this.floaters.add(this.player.x, this.player.y - 20, "보스가 살아있는 동안 계단이 봉인되어 있습니다!", '#ff5555');
                    }
                } else {
                    this.descendStairs();
                }
            }

            this.handleInteractables();

            this.spawnTimer++;
            if (this.spawnTimer >= SPAWN_INTERVAL) {
                this.spawnTimer = 0;
                this.spawnMonster();
            }

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const p = this.projectiles.at(i);
                p.update(this.map);

                let hitMonster = null;
                for (const m of this.monsters) {
                    if (m.state === 'death') continue;
                    if (Math.hypot(p.x - m.x, p.y - m.y) < p.radius + m.radius) {
                        hitMonster = m;
                        break;
                    }
                }

                if (hitMonster) {
                    const expGained = hitMonster.takeDamage(p.damage, this.floaters, p.type);
                    if (p.slow) hitMonster.applySlow(p.slow);
                    if (expGained > 0) this.handleMonsterKill(hitMonster);

                    // Fireball splash: reduced damage to other nearby monsters
                    if (p.splash > 0) {
                        for (const m of this.monsters) {
                            if (m === hitMonster || m.state === 'death') continue;
                            if (Math.hypot(p.x - m.x, p.y - m.y) <= p.splash + m.radius) {
                                const exp = m.takeDamage(Math.floor(p.damage * 0.6), this.floaters, p.type);
                                if (exp > 0) this.handleMonsterKill(m);
                            }
                        }
                        this.effects.push({ type: 'whirlwind', x: p.x, y: p.y, radius: p.splash, color: p.color, life: 10, maxLife: 10 });
                    }
                    this.updateUI();
                }

                if (hitMonster || p.life <= 0) {
                    this.projectiles.splice(i, 1);
                }
            }

            // Age out transient skill effects
            this.effects = this.effects.filter(e => --e.life > 0);

            for (let i = this.monsters.length - 1; i >= 0; i--) {
                const m = this.monsters.at(i);
                const dmgToPlayer = m.update(this.player, this.map);

                if (dmgToPlayer > 0) {
                    this.damagePlayer(dmgToPlayer);
                    if (!this.isGameRunning) return;
                }

                // Necromancer/lich queued a ranged bolt this frame
                if (m.pendingShot) {
                    this.enemyProjectiles.push(new EnemyProjectile(
                        m.x, m.y, m.pendingShot.tx, m.pendingShot.ty, m.pendingShot.dmg
                    ));
                    sfx.playFireball();
                    m.pendingShot = null;
                }

                // Lich raises skeleton minions around itself
                if (m.pendingSummon) {
                    const count = m.pendingSummon;
                    m.pendingSummon = null;
                    if (this.monsters.length < MAX_MONSTERS + 6) {
                        for (let s = 0; s < count; s++) {
                            const ang = Math.random() * Math.PI * 2;
                            const minion = new Monster(
                                m.x + Math.cos(ang) * 40, m.y + Math.sin(ang) * 40,
                                this.floor * 2, 'normal', 'skeleton'
                            );
                            minion.goldMult = 0;
                            this.monsters.push(minion);
                        }
                        this.floaters.add(m.x, m.y - 36, "망자 소환!", '#a64dff');
                        sfx.playBossSpawn();
                    }
                }

                // Overlord erupts a fire nova; damages the player if too close
                if (m.pendingNova) {
                    const nova = m.pendingNova;
                    m.pendingNova = null;
                    this.effects.push({ type: 'whirlwind', x: m.x, y: m.y, radius: nova.radius, color: '#ff5500', life: 22, maxLife: 22 });
                    sfx.playFireball();
                    if (Math.hypot(this.player.x - m.x, this.player.y - m.y) <= nova.radius) {
                        this.damagePlayer(nova.dmg);
                        if (!this.isGameRunning) return;
                    }
                }

                if (m.state === 'death' && m.deathTimer <= 0) {
                    this.monsters.splice(i, 1);
                }
            }

            // Necromancer bolts travel and hit the player
            for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
                const ep = this.enemyProjectiles.at(i);
                ep.update(this.map);
                let consumed = ep.life <= 0;
                if (Math.hypot(ep.x - this.player.x, ep.y - this.player.y) < ep.radius + this.player.radius) {
                    this.damagePlayer(ep.damage);
                    if (!this.isGameRunning) return;
                    consumed = true;
                }
                if (consumed) this.enemyProjectiles.splice(i, 1);
            }
        }

        this.floaters.update();

        // --- DRAWING STEP ---
        this.renderScene();

        requestAnimationFrame(() => this.run());
    }

    renderScene() {
        this.ctx.fillStyle = '#080606';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.applyZoom();
        this.map.render(this.ctx, this.camera, this.canvas.width, this.canvas.height);

        // Walls, props, actors and projectiles share one painter's-order list
        const entities = [];
        this.collectWallEntities(entities);

        const pushRef = ref => entities.push({
            depth: ref.x + ref.y + (ref.depthOffset || 0),
            render: () => ref.render(this.ctx, this.camera, this.canvas.width, this.canvas.height)
        });

        pushRef(this.player);
        if (this.currentMap === 'dungeon') {
            this.props.forEach(pushRef);
            this.monsters.forEach(pushRef);
            this.projectiles.forEach(pushRef);
            this.enemyProjectiles.forEach(pushRef);
            if (this.dungeonPortal) pushRef(this.dungeonPortal);
        } else {
            this.townProps.forEach(pushRef);
            if (this.townPortal) pushRef(this.townPortal);
            pushRef(this.npc);
        }

        entities.sort((a, b) => a.depth - b.depth);
        for (const ent of entities) {
            ent.render();
        }

        this.renderEffects();
        this.ctx.restore();

        this.renderLighting();
        this.renderParticles();

        // Floaters render above the darkness so damage numbers stay readable
        this.applyZoom();
        this.floaters.render(this.ctx, this.camera, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        this.renderCastingBar();
        this.renderMinimap();
    }

    renderCastingBar() {
        if (this.castTimer <= 0 || !this.castName) return;
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(0, 0, cw, ch);
        ctx.restore();

        const barW = 200;
        const barH = 14;
        const barX = (cw - barW) / 2;
        const barY = ch - 80;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowColor = 'rgba(212, 175, 55, 0.3)';
        ctx.shadowBlur = 8;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.shadowBlur = 0;

        const progress = 1 - (this.castTimer / (this.maxCastTimer || 90));
        const fillW = Math.max(2, Math.floor(barW * progress));
        const gradient = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        gradient.addColorStop(0, '#8c7853');
        gradient.addColorStop(1, '#d4af37');
        ctx.fillStyle = gradient;
        ctx.fillRect(barX, barY, fillW, barH);

        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#e0d8cf';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this.castName, cw / 2, barY - 4);
        ctx.restore();
    }

    // Lightning arcs and whirlwind/splash rings, drawn in the zoomed world pass
    renderEffects() {
        if (this.effects.length === 0) return;
        const ctx = this.ctx;
        const isoCam = this.camera.getIsoOffset();
        const hw = this.canvas.width / 2;
        const hh = this.canvas.height / 2;
        const toScreen = (x, y) => ({
            x: (x - y) - isoCam.x + hw,
            y: (x + y) * 0.5 - isoCam.y + hh
        });

        for (const e of this.effects) {
            const a = e.life / e.maxLife;
            ctx.save();
            if (e.type === 'lightning') {
                ctx.globalAlpha = a;
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 12;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                for (let i = 0; i < e.segments.length; i++) {
                    const s = toScreen(e.segments[i].x, e.segments[i].y);
                    if (i === 0) {
                        ctx.moveTo(s.x, s.y);
                    } else {
                        // jittered midpoint gives each arc a jagged bolt look
                        const prev = toScreen(e.segments[i - 1].x, e.segments[i - 1].y);
                        ctx.lineTo((prev.x + s.x) / 2 + (Math.random() - 0.5) * 12,
                                   (prev.y + s.y) / 2 + (Math.random() - 0.5) * 12);
                        ctx.lineTo(s.x, s.y);
                    }
                }
                ctx.stroke();
            } else if (e.type === 'whirlwind') {
                const c = toScreen(e.x, e.y);
                ctx.globalAlpha = a * 0.7;
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 8;
                ctx.lineWidth = 3;
                const grow = 0.55 + (1 - a) * 0.5;
                ctx.beginPath();
                ctx.ellipse(c.x, c.y - 6, e.radius * grow, e.radius * 0.5 * grow, (1 - a) * Math.PI * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }
}

