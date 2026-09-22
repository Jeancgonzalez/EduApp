import React from 'react';

const cell = (x, y, color, size) => (
  <rect x={x} y={y} width={size} height={size} fill={color} />
);

const renderGrid = (rows, color, rect) => {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') out.push(cell(x * rect, y * rect, color, rect));
    }
  });
  return out;
};

const STAR_GRID = [
  '........XX........',
  '........XX........',
  '.......XXXX.......',
  '.......XXXX.......',
  '......XXXXXX......',
  '.....XXXXXXXX.....',
  '....XXXXXXXXXX....',
  'XXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXX',
  '....XXXXXXXXXX....',
  '.....XXXXXXXX.....',
  '......XXXXXX......',
  '.......XXXX.......',
  '.......XXXX.......',
  '........XX........',
  '........XX........'
];

const TROPHY_GRID = [
  '..XXXX....XXXX..',
  '.XXXXXX..XXXXXX.',
  'XXXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '....XXXXXXXX....'
];

const MEDAL_GRID = [
  '....XXXX....',
  '..XXXXXXXX..',
  '.XXXXXXXXXX.',
  '.XXXXXXXXXX.',
  '.X.XXXXXX.X.',
  '.XXXXXXXXXX.',
  '.XXXXXXXXXX.',
  '..XXXXXXXX..',
  '...XXXXXX...',
  '...XXXXXX...',
  '...XX..XX...',
  '....X..X....'
];

const CHECK_GRID = [
  '............',
  '............',
  '..........X.',
  '..........XX',
  '.........XXX',
  '........XXX.',
  '..XXXX.XXX..',
  '..XXXXXXXX..',
  '...XXXXXXX..',
  '...XXXXXX...',
  '....XXXX....',
  '............'
];

const PixelIcon = ({ grid, color = 'currentColor', size = 16, style }) => (
  <svg
    viewBox={`0 0 ${grid[0].length} ${grid.length}`}
    width={size}
    height={size}
    shapeRendering="crispEdges"
    imageRendering="pixelated"
    aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
  >
    {renderGrid(grid, color, 1)}
  </svg>
);

export const PixelStar = ({ color, size, style }) => (
  <PixelIcon grid={STAR_GRID} color={color || '#f59e0b'} size={size} style={style} />
);

export const PixelTrophy = ({ color, size, style }) => (
  <PixelIcon grid={TROPHY_GRID} color={color || '#fbbf24'} size={size} style={style} />
);

export const PixelMedal = ({ color, size, style }) => (
  <PixelIcon grid={MEDAL_GRID} color={color || '#60a5fa'} size={size} style={style} />
);

export const PixelCheck = ({ color, size, style }) => (
  <PixelIcon grid={CHECK_GRID} color={color || '#10b981'} size={size} style={style} />
);