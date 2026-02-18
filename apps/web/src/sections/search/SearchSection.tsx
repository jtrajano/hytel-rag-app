import { useState } from 'react'
import { Search, Loader2, ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useSearchPlace } from '@/hooks/useSearchPlace'
import { SearchResults } from './SearchResults'
import { POPULAR_SEARCHES } from './searchConstants'

const SearchSection = () => {
  const [inputQuery, setInputQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const { data, isLoading, isError } = useSearchPlace(submittedQuery)

  const handleSearch = () => setSubmittedQuery(inputQuery)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handlePopularSearch = (city: string) => {
    setInputQuery(city)
    setSubmittedQuery(city)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 text-muted-foreground hover:text-foreground"
          >
            <Link to="/dashboard">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Search Air Quality</h1>
            <p className="text-sm text-muted-foreground">
              Look up pollution levels for any city or country
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search city or country..."
              className="pl-9"
              value={inputQuery}
              onChange={e => setInputQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={handleSearch} className="px-5">
            Search
          </Button>
        </div>

        {/* Popular searches */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Popular searches
          </p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map(city => (
              <Badge
                key={city}
                variant="outline"
                className="cursor-pointer px-3 py-1.5 text-sm font-normal hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                onClick={() => handlePopularSearch(city)}
              >
                {city}
              </Badge>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <Card className="border-destructive/30">
            <CardContent className="p-5 text-sm text-destructive">
              Something went wrong while searching. Please try again.
            </CardContent>
          </Card>
        )}

        {/* No results state */}
        {!isLoading && !isError && submittedQuery.length > 0 && data === null && (
          <Card className="border-border">
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">
                No results found for{' '}
                <span className="font-medium text-foreground">"{submittedQuery}"</span>.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try searching for a city name or country listed in popular searches.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {!isLoading && !isError && data && <SearchResults result={data} />}
      </main>
    </div>
  )
}

export default SearchSection
