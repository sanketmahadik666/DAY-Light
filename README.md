
# DAY-LIGHT

**A date-based global events explorer inspired by the Marathi phrase "दिनविशेष (Dinvishesh)"**

**DAY-LIGHT** is a lightweight, client-side Next.js application that displays interesting facts, historical events, global holidays, space highlights, and notable birthdays or deaths for any selected date. The project is designed to start small but is planned with extensibility for future growth.

---

## Overview

**DAY-LIGHT** allows users to pick a date and instantly view curated information about what happened around the world on the same day across history. It relies entirely on public APIs and performs all operations on the client side. No backend or server is required for the initial version.

This project is ideal for learning, exploration, and building a daily knowledge experience similar to "On This Day" platforms but with more features and flexible filtering.

---

## Features

* Date picker to select any day of the year
* Fetch historical events, births, and deaths
* Fetch global holidays for the selected date
* Display astronomy or space facts for the date
* Show fun facts and media from public sources
* Filtering by:
  * Events, Births, Deaths
  * Holidays
  * Space-related highlights

---

## Public APIs Used

### Wikipedia / Wikidata API

Primary source for: historical events, births, deaths.
API: `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/{month}/{day}`

### Calendarific API

Used for country-specific holiday information.
`https://calendarific.com/`

### NASA APIs

Provides astronomy picture of the day and other date-based space content.
`https://api.nasa.gov/planetary/apod?date=YYYY-MM-DD`

### Numbers API

Provides interesting trivia and date facts.
`http://numbersapi.com/{month}/{day}/date`

---

## Project Goals

The main goal of **DAY-LIGHT** is to create an open, simple, and user-friendly platform that displays meaningful and accurate historical information tied to any given date. Inspired by the culturally rich tradition of "Dinvishesh", **DAY-LIGHT** aims to build a modern digital version of date-based knowledge discovery.

The architecture is intentionally kept simple to allow future modular expansion without major rewrites.

---

## Development Roadmap

### Initial Plan

* Next.js setup
* Date selection
* Fetch data from Wikipedia, NASA, and Numbers API
* Show events, births, deaths, and a daily space highlight
* Simple UI with cards and filters

### Filtering and UI Enhancements

* Add filtering by categories and regions
* Add timeline layout for events

### AI Integrations

* Summaries of the day
* Automatic tagging of events

### Backend Support (Not Considered)

* User accounts
* Favorites
* Rate-limit handling
* Aggregation and caching

---

## Technology Stack

* **Next.js**
* **Client-side data fetching**
* **Tailwind CSS**
* Public and open APIs

---

## How It Works

1. User selects a date from the UI.
2. Client components make API calls based on month/day or full date.
3. Raw data from different APIs is merged and normalized.
4. UI renders events grouped by type (Events, Births, Deaths, Holidays, Space).
5. Optional filters allow users to refine what they see.

---

## Future Extensibility

**DAY-LIGHT** is designed to scale into a more advanced platform including:

* AI-generated insights
* Personalized recommendations
* Multi-language support
* Database-backed content curation

The architecture encourages plugging in additional data sources or features without breaking existing components.

---

## [Contributing](CONTRIBUTING.md)