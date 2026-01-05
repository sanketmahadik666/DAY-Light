import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../DatePicker';
import { getTodayDateString } from '@/utils/helpers';
import userEvent from '@testing-library/user-event';

jest.mock('@/utils/helpers', () => ({
  ...jest.requireActual('@/utils/helpers'),
  getTodayDateString: jest.fn(),
  isValidDateString: jest.fn().mockReturnValue(true),
}));

describe('DatePicker', () => {
  const mockOnSelectionChange = jest.fn();
  const today = '2023-01-01';

  beforeEach(() => {
     jest.clearAllMocks();
     (getTodayDateString as jest.Mock).mockReturnValue(today);
  });

  it('should render single date mode by default', () => {
    render(<DatePicker onSelectionChange={mockOnSelectionChange} />);
    
    expect(screen.getByRole('tab', { name: /single date/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/select date/i)).toBeInTheDocument();
  });

  it('should switch modes', async () => {
    const user = userEvent.setup();
    render(<DatePicker onSelectionChange={mockOnSelectionChange} />);
    
    const rangeTab = screen.getByRole('tab', { name: /date range/i });
    await user.click(rangeTab);

    expect(rangeTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it('should validate single date', async () => {
    const user = userEvent.setup();
    render(<DatePicker onSelectionChange={mockOnSelectionChange} minDate="2023-01-01" />);

    const input = screen.getByLabelText(/select date/i);
    
    // Invalid date (before min)
    await user.clear(input);
    await user.type(input, '2022-12-31');

    expect(screen.getByRole('alert')).toHaveTextContent(/must be after/i);
  });
  
  it('should validate date range', async () => {
      const user = userEvent.setup();
      render(<DatePicker onSelectionChange={mockOnSelectionChange} mode="range" />);
      
      const startInput = screen.getByLabelText(/start date/i);
      const endInput = screen.getByLabelText(/end date/i);
      
      // Invalid range (end before start)
      await user.clear(startInput);
      await user.type(startInput, '2023-01-05');
      await user.clear(endInput);
      await user.type(endInput, '2023-01-01');
      
      expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
  });
});
