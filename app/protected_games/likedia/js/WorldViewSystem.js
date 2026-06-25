class WorldViewSystem {
    static worldToIso(x, y) {
        return {
            x: x - y,
            y: (x + y) * 0.5
        };
    }

    static isoToWorld(isoX, isoY) {
        return {
            x: (isoX + 2 * isoY) * 0.5,
            y: (2 * isoY - isoX) * 0.5
        };
    }

    static tileToWorld(c, r, tileSize = 64) {
        return {
            x: c * tileSize + tileSize / 2,
            y: r * tileSize + tileSize / 2
        };
    }
}
