// Placeholder photos for the email body.
//
// These are free-to-use landscape photos from Unsplash (https://unsplash.com/license),
// loaded from Unsplash's image CDN. Each one was checked to load and to show no
// identifiable people. Lorem Picsum was the first choice, but it went down
// (Nov 2026), so the photo list is fixed here instead of depending on it.
//
// Only ids from this list are accepted, so the app can't be used to embed
// arbitrary images in an email.

export const PHOTO_IDS = [
  '1506744038136-46273834b3fb',
  '1500530855697-b586d89ba3ee',
  '1469474968028-56623f02e42e',
  '1501785888041-af3ef285b470',
  '1441974231531-c6227db76b6e',
  '1470071459604-3b5ec3a7fe05',
  '1472214103451-9374bd1c798e',
  '1447752875215-b2761acb3c5d',
  '1433086966358-54859d0ed716',
  '1465146344425-f00d5f5c8f07',
  '1490750967868-88aa4486c946',
  '1507525428034-b723cf961d3e',
  '1519681393784-d120267933ba',
  '1500534314209-a25ddb2bd429',
  '1426604966848-d7adac402bff',
  '1475924156734-496f6cac6ec1',
  '1418065460487-3e41a6c84dc5',
  '1505765050516-f72dcac9c60e',
  '1464822759023-fed622ff2c3b',
  '1501854140801-50d01698950b',
  '1494500764479-0c8f2919a3d8',
  '1439066615861-d1af74d74000',
  '1482192596544-9eb780fc7f66',
];

const KNOWN = new Set(PHOTO_IDS);

export function isKnownPhoto(id) {
  return typeof id === 'string' && KNOWN.has(id);
}

/** 600x360 JPEG, cropped to fill. JPEG (not WebP) so every email client can show it. */
export function photoUrl(id) {
  return `https://images.unsplash.com/photo-${id}?w=600&h=360&fit=crop&fm=jpg&q=70`;
}
