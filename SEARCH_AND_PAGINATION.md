# Search and Pagination Features

## Overview
The Music Catalogue has been reimplemented with advanced search functionality and server-side pagination for better performance and user experience.

## Features Implemented

### 1. Advanced Search
- **Multi-field search**: Search across song titles, album names, and artist names
- **Case-insensitive**: Search works regardless of capitalization
- **Debounced input**: Search triggers automatically after 500ms of user input
- **Real-time results**: Search results update as you type

### 2. Server-Side Pagination
- **Configurable page size**: Default 10 items per page
- **Efficient data loading**: Only loads data for current page
- **Smooth navigation**: Previous/Next buttons with page numbers
- **Auto-reset**: Returns to page 1 when search term changes

### 3. Enhanced Data Display
- **Complete song information**: Title, artist, album, track number, duration
- **Album artwork**: Displays album cover when available
- **Audio previews**: Native HTML5 audio player for preview URLs
- **Spotify integration**: Direct links to Spotify tracks
- **Purchase system**: Buy and download functionality for authenticated users

## Technical Implementation

### Backend Changes

#### New Search API Endpoint
```javascript
GET /api/search?q={searchTerm}&page={page}&limit={limit}
```

**Parameters:**
- `q`: Search query (optional)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response:**
```json
{
  "songs": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "itemsPerPage": 10
  }
}
```

#### Enhanced Metadata Endpoint
The `/metadata` endpoint now includes related data:
- Album information with media
- Track artists with artist details
- Album artists

### Frontend Changes

#### State Management
- `songs`: Current page songs
- `currentPage`: Active page number
- `totalPages`: Total number of pages
- `totalItems`: Total number of songs
- `loading`: Loading state indicator

#### Search Implementation
- Debounced search input (500ms delay)
- Automatic page reset on search
- Real-time result updates

#### Pagination Component
- Dynamic page number display
- Previous/Next navigation
- Smooth scroll to top on page change

## Usage Examples

### Basic Search
1. Type in the search bar
2. Results appear automatically after 500ms
3. Use pagination to navigate through results

### Advanced Search
- Search by song title: "Bohemian Rhapsody"
- Search by artist: "Queen"
- Search by album: "A Night at the Opera"

### Navigation
- Click page numbers to jump to specific pages
- Use Previous/Next buttons for sequential navigation
- Search automatically resets to page 1

## Performance Benefits

1. **Reduced Data Transfer**: Only loads current page data
2. **Faster Rendering**: Smaller DOM updates
3. **Better UX**: No lag when searching large datasets
4. **Scalable**: Handles thousands of songs efficiently

## Future Enhancements

1. **Filtering**: Add genre, year, and duration filters
2. **Sorting**: Sort by title, artist, album, or popularity
3. **Advanced Search**: Boolean operators and exact matching
4. **Search History**: Remember recent searches
5. **Saved Searches**: Save frequently used search queries

## Troubleshooting

### Common Issues

1. **No results found**: Check search term spelling and try broader terms
2. **Pagination not working**: Ensure backend is running and database has data
3. **Search not responding**: Check network connection and backend status

### Debug Information
- Check browser console for error messages
- Verify backend API endpoints are accessible
- Confirm database contains track data with proper relationships
