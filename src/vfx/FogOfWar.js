// FogOfWar.js
import { TILE_TYPES } from '../entities/Tile.js';

export class FogOfWar {
    constructor(scene, tilemapService, config = {}) {
        this.scene = scene;
        this.tilemap = tilemapService;
        this.visionRange = config.visionRange ?? 7;
        this.fogSprites = []; // 2D array of fog overlay sprites

        // Create the glitched texture once
        this._createFogTexture();
    }

    /**
     * Creates a canvas-based glitched texture for the fog overlay.
     */
    _createFogTexture() {
        const { width, height } = this._getTextureSize();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Dark background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, width, height);

        // Random glitch blocks
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const w = 4 + Math.random() * 12;
            const h = 2 + Math.random() * 6;
            const colors = ['#ff00ff', '#00ffff', '#ff6600', '#ffffff', '#44ff44'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(x, y, w, h);
        }

        // Scanlines
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * 5);
            ctx.lineTo(width, i * 5);
            ctx.stroke();
        }

        // RGB shift artifacts
        ctx.fillStyle = '#ff000066';
        ctx.fillRect(5, 10, 15, 8);
        ctx.fillStyle = '#00ff0066';
        ctx.fillRect(20, 25, 12, 6);

        this.scene.textures.addCanvas('fog_overlay', canvas);
    }

    _getTextureSize() {
        // Match tile size – we assume 40x40 tiles
        const TS = this.tilemap.TILE_SIZE || 40;
        return { width: TS, height: TS };
    }

    /**
     * Renders fog sprites over all tiles.
     */
    render() {
        const TS = this.tilemap.TILE_SIZE;
        const ox = this.tilemap.offsetX;
        const oy = this.tilemap.offsetY;
        const cols = this.tilemap.COLS;
        const rows = this.tilemap.ROWS;

        this.fogSprites = [];

        for (let y = 0; y < rows; y++) {
            this.fogSprites[y] = [];
            for (let x = 0; x < cols; x++) {
                const px = ox + x * TS + TS / 2;
                const py = oy + y * TS + TS / 2;
                const fog = this.scene.add.sprite(px, py, 'fog_overlay')
                    .setDepth(2)      // above tiles (depth 0-1)
                    .setVisible(true);
                this.fogSprites[y][x] = fog;
            }
        }
    }

    /**
     * Checks if a tile blocks vision (walls and high cover).
     */
    _isTileOpaque(tile) {
        return tile.type === TILE_TYPES.WALL || tile.type === TILE_TYPES.COVER_HIGH;
    }

    /**
     * Computes the set of visible tile coordinates (as strings "x,y").
     * Uses BFS from all player units, respecting opaque tiles and vision range.
     */
    computeVisibleTiles(playerUnits) {
        const visible = new Set();

        for (const unit of playerUnits) {
            const startPos = this.tilemap.worldToGrid(unit.sprite.x, unit.sprite.y);
            // BFS queue: each element is { x, y, dist }
            const queue = [{ x: startPos.x, y: startPos.y, dist: 0 }];
            const visited = new Set();
            visited.add(`${startPos.x},${startPos.y}`);

            while (queue.length > 0) {
                const { x, y, dist } = queue.shift();
                visible.add(`${x},${y}`);

                if (dist >= this.visionRange) continue;

                const neighbors = [
                    { x: x + 1, y },
                    { x: x - 1, y },
                    { x, y: y + 1 },
                    { x, y: y - 1 }
                ];

                for (const n of neighbors) {
                    const key = `${n.x},${n.y}`;
                    if (visited.has(key)) continue;

                    const tile = this.tilemap.getTile(n.x, n.y);
                    if (!tile) continue;

                    visited.add(key);

                    // Stop at opaque tiles – they block vision
                    if (this._isTileOpaque(tile)) continue;

                    queue.push({ x: n.x, y: n.y, dist: dist + 1 });
                }
            }
        }
        return visible;
    }

    /**
     * Updates fog overlay visibility based on visible tiles.
     */
    _updateFogOverlay(visibleTiles) {
        for (let y = 0; y < this.tilemap.ROWS; y++) {
            for (let x = 0; x < this.tilemap.COLS; x++) {
                const fog = this.fogSprites[y]?.[x];
                if (fog) {
                    const key = `${x},${y}`;
                    fog.setVisible(!visibleTiles.has(key));
                }
            }
        }
    }

    /**
     * Hides enemy units that are not in visible tiles.
     */
    _updateUnitVisibility(allUnits, visibleTiles, selectedUnit = null) {
        for (const unit of allUnits) {
            // Always show player units
            if (unit.type === 'player') {
                unit.sprite.setVisible(true);
                unit.nameLabel.setVisible(true);
                // Keep marker if selected, otherwise hide
                if (unit.marker) {
                    unit.marker.setVisible(selectedUnit === unit);
                }
                if (unit.sprite.input) unit.sprite.input.enabled = true;
                continue;
            }

            // Enemy unit: visibility depends on tile
            const tilePos = this.tilemap.worldToGrid(unit.sprite.x, unit.sprite.y);
            const isVisible = visibleTiles.has(`${tilePos.x},${tilePos.y}`);

            unit.sprite.setVisible(isVisible);
            unit.nameLabel.setVisible(isVisible);

            if (unit.marker) {
                unit.marker.setVisible(isVisible && selectedUnit === unit);
            }

            // Enable/disable click interaction
            if (unit.sprite.input) {
                unit.sprite.input.enabled = isVisible;
            }
        }
    }

    /**
     * Main update method – recompute visibility and sync fog + unit visibility.
     */
    update(playerUnits, allUnits, selectedUnit = null) {
        const visibleTiles = this.computeVisibleTiles(playerUnits);
        this._updateFogOverlay(visibleTiles);
        this._updateUnitVisibility(allUnits, visibleTiles, selectedUnit);
    }

    /**
     * Optional: change vision range dynamically.
     */
    setVisionRange(newRange) {
        this.visionRange = newRange;
    }
}