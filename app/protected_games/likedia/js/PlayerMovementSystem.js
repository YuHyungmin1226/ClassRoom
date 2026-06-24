class PlayerMovementSystem {
    constructor(player, map) {
        this.player = player;
        this.map = map;
        this.movingByKeys = false;
    }

    setMap(map) {
        this.map = map;
    }

    moveTo(tx, ty) {
        const p = this.player;
        if (p.state === 'attack') return;
        p.path = [];
        p.targetX = tx;
        p.targetY = ty;
    }

    setPath(points) {
        const p = this.player;
        if (p.state === 'attack') return;
        if (!points || points.length === 0) return;
        p.targetX = points[0].x;
        p.targetY = points[0].y;
        p.path = points.slice(1);
    }

    update() {
        const p = this.player;
        const map = this.map;

        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 5) {
            p.state = 'walk';
            p.animTimer += p.animSpeed;

            const vx = (dx / dist) * p.speed;
            const vy = (dy / dist) * p.speed;

            let angle = Math.atan2(vy, vx);
            if (angle < 0) angle += Math.PI * 2;

            p.direction = Math.round(angle / (Math.PI / 4)) % 8;

            const newX = p.x + vx;
            const newY = p.y + vy;

            if (!map.isSolid(newX, p.y)) {
                p.x = newX;
            } else {
                p.targetX = p.x;
            }

            if (!map.isSolid(p.x, newY)) {
                p.y = newY;
            } else {
                p.targetY = p.y;
            }
        } else if (p.path.length > 0) {
            const next = p.path.shift();
            p.targetX = next.x;
            p.targetY = next.y;
        } else {
            p.state = 'idle';
            p.animTimer = 0;
        }
    }

    hasLineOfSight(x0, y0, x1, y1) {
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.ceil(dist / 12);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (this.map.isSolid(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) {
                return false;
            }
        }
        return true;
    }

    moveTowards(tx, ty) {
        if (this.hasLineOfSight(this.player.x, this.player.y, tx, ty)) {
            this.moveTo(tx, ty);
            return;
        }

        const path = this.map.findPath(this.player.x, this.player.y, tx, ty);
        if (!path || path.length === 0) {
            this.moveTo(tx, ty);
            return;
        }
        if (!this.map.isSolid(tx, ty)) {
            path.push({ x: tx, y: ty });
        }

        const smoothed = [];
        let anchor = { x: this.player.x, y: this.player.y };
        for (let i = 0; i < path.length; i++) {
            const isLast = i === path.length - 1;
            if (!isLast && this.hasLineOfSight(anchor.x, anchor.y, path[i + 1].x, path[i + 1].y)) {
                continue;
            }
            smoothed.push(path[i]);
            anchor = path[i];
        }
        this.setPath(smoothed);
    }

    processKeyboardMovement(keys) {
        if (this.player.castTimer > 0) return;
        let mx = 0;
        let my = 0;
        if (keys.W) my -= 1;
        if (keys.S) my += 1;
        if (keys.A) mx -= 1;
        if (keys.D) mx += 1;

        if (mx !== 0 || my !== 0) {
            let wx = (mx + 2 * my) * 0.5;
            let wy = (2 * my - mx) * 0.5;
            const len = Math.hypot(wx, wy);
            wx /= len;
            wy /= len;
            this.moveTo(this.player.x + wx * 50, this.player.y + wy * 50);
            this.movingByKeys = true;
        } else if (this.movingByKeys) {
            this.moveTo(this.player.x, this.player.y);
            this.movingByKeys = false;
        }
    }
}
