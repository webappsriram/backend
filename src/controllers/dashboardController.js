import pool from '../config/database.js';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req, res) => {
  try {
    // Get date range from query parameters, default to today
    let fromDate = req.query.fromDate;
    let toDate = req.query.toDate;
    
    // If no dates provided, default to today
    if (!fromDate || !toDate) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      fromDate = fromDate || todayStr;
      toDate = toDate || todayStr;
    }

    // Ensure dates are in YYYY-MM-DD format and set time to start/end of day
    const fromDateTime = `${fromDate} 00:00:00`;
    const toDateTime = `${toDate} 23:59:59`;

    // Calculate previous period for comparison (same duration before fromDate)
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    const daysDiff = Math.ceil((toDateObj - fromDateObj) / (1000 * 60 * 60 * 24));
    const prevToDate = new Date(fromDateObj);
    prevToDate.setDate(prevToDate.getDate() - 1);
    const prevFromDate = new Date(prevToDate);
    prevFromDate.setDate(prevFromDate.getDate() - daysDiff);
    
    const prevFromDateTime = `${prevFromDate.toISOString().split('T')[0]} 00:00:00`;
    const prevToDateTime = `${prevToDate.toISOString().split('T')[0]} 23:59:59`;

    // Get total revenue (sum of total_amount from paid invoices within date range)
    const [revenueResult] = await pool.execute(
      `SELECT COALESCE(SUM(total_amount), 0) as total_revenue
       FROM invoices
       WHERE is_deleted = FALSE 
         AND status = 'paid'
         AND DATE(created_on) >= DATE(?)
         AND DATE(created_on) <= DATE(?)`,
      [fromDateTime, toDateTime]
    );

    // Get my revenue (sum of total_amount from paid invoices created by logged-in user within date range)
    const loggedInUserId = req.user?.id;
    const [myRevenueResult] = await pool.execute(
      `SELECT COALESCE(SUM(total_amount), 0) as my_revenue
       FROM invoices
       WHERE is_deleted = FALSE 
         AND status = 'paid'
         AND created_by = ?
         AND DATE(created_on) >= DATE(?)
         AND DATE(created_on) <= DATE(?)`,
      [loggedInUserId, fromDateTime, toDateTime]
    );

    // Get total sales count (all non-deleted, non-cancelled invoices within date range)
    const [salesResult] = await pool.execute(
      `SELECT COUNT(*) as total_sales
       FROM invoices
       WHERE is_deleted = FALSE 
         AND status != 'cancelled'
         AND DATE(created_on) >= DATE(?)
         AND DATE(created_on) <= DATE(?)`,
      [fromDateTime, toDateTime]
    );

    // Get my sales count (invoices created by logged-in user within date range)
    const [mySalesResult] = await pool.execute(
      `SELECT COUNT(*) as my_sales
       FROM invoices
       WHERE is_deleted = FALSE 
         AND status != 'cancelled'
         AND created_by = ?
         AND DATE(created_on) >= DATE(?)
         AND DATE(created_on) <= DATE(?)`,
      [loggedInUserId, fromDateTime, toDateTime]
    );

    // Get total customers count (customers created within date range)
    const [customersResult] = await pool.execute(
      `SELECT COUNT(*) as total_customers
       FROM customers
       WHERE is_deleted = FALSE
         AND DATE(created_on) >= DATE(?)
         AND DATE(created_on) <= DATE(?)`,
      [fromDateTime, toDateTime]
    );

    // Get revenue change (compare selected period with previous period of same duration)
    const [revenueChangeResult] = await pool.execute(
      `SELECT 
        COALESCE(SUM(CASE WHEN DATE(created_on) >= DATE(?) 
                          AND DATE(created_on) <= DATE(?)
                          AND status = 'paid' 
                     THEN total_amount ELSE 0 END), 0) as current_period,
        COALESCE(SUM(CASE WHEN DATE(created_on) >= DATE(?) 
                          AND DATE(created_on) <= DATE(?)
                          AND status = 'paid' 
                     THEN total_amount ELSE 0 END), 0) as previous_period
       FROM invoices
       WHERE is_deleted = FALSE`,
      [fromDateTime, toDateTime, prevFromDateTime, prevToDateTime]
    );

    const currentPeriod = parseFloat(revenueChangeResult[0].current_period) || 0;
    const previousPeriod = parseFloat(revenueChangeResult[0].previous_period) || 0;
    const revenueChange = currentPeriod - previousPeriod;

    // Get sales count change (compare selected period with previous period)
    const [salesChangeResult] = await pool.execute(
      `SELECT 
        COUNT(CASE WHEN DATE(created_on) >= DATE(?) 
                   AND DATE(created_on) <= DATE(?)
                   AND status != 'cancelled' 
              THEN 1 END) as current_period,
        COUNT(CASE WHEN DATE(created_on) >= DATE(?) 
                   AND DATE(created_on) <= DATE(?)
                   AND status != 'cancelled' 
              THEN 1 END) as previous_period
       FROM invoices
       WHERE is_deleted = FALSE`,
      [fromDateTime, toDateTime, prevFromDateTime, prevToDateTime]
    );

    const currentPeriodSales = parseInt(salesChangeResult[0].current_period) || 0;
    const previousPeriodSales = parseInt(salesChangeResult[0].previous_period) || 0;
    const salesChange = currentPeriodSales - previousPeriodSales;

    // Get my sales count change (compare selected period with previous period for logged-in user)
    const [mySalesChangeResult] = await pool.execute(
      `SELECT 
        COUNT(CASE WHEN DATE(created_on) >= DATE(?) 
                   AND DATE(created_on) <= DATE(?)
                   AND status != 'cancelled' 
              THEN 1 END) as current_period,
        COUNT(CASE WHEN DATE(created_on) >= DATE(?) 
                   AND DATE(created_on) <= DATE(?)
                   AND status != 'cancelled' 
              THEN 1 END) as previous_period
       FROM invoices
       WHERE is_deleted = FALSE AND created_by = ?`,
      [fromDateTime, toDateTime, prevFromDateTime, prevToDateTime, loggedInUserId]
    );

    const currentPeriodMySales = parseInt(mySalesChangeResult[0].current_period) || 0;
    const previousPeriodMySales = parseInt(mySalesChangeResult[0].previous_period) || 0;
    const mySalesChange = currentPeriodMySales - previousPeriodMySales;

    // Get customers change (compare selected period with previous period)
    const [customersChangeResult] = await pool.execute(
      `SELECT 
        COUNT(CASE WHEN DATE(created_on) >= DATE(?) 
                   AND DATE(created_on) <= DATE(?)
              THEN 1 END) as current_period,
        COUNT(CASE WHEN DATE(created_on) >= DATE(?) 
                   AND DATE(created_on) <= DATE(?)
              THEN 1 END) as previous_period
       FROM customers
       WHERE is_deleted = FALSE`,
      [fromDateTime, toDateTime, prevFromDateTime, prevToDateTime]
    );

    const currentPeriodCustomers = parseInt(customersChangeResult[0].current_period) || 0;
    const previousPeriodCustomers = parseInt(customersChangeResult[0].previous_period) || 0;
    const customersChange = currentPeriodCustomers - previousPeriodCustomers;

    // Get my revenue change (compare selected period with previous period)
    const [myRevenueChangeResult] = await pool.execute(
      `SELECT 
        COALESCE(SUM(CASE WHEN DATE(created_on) >= DATE(?) 
                          AND DATE(created_on) <= DATE(?)
                          AND status = 'paid' 
                     THEN total_amount ELSE 0 END), 0) as current_period,
        COALESCE(SUM(CASE WHEN DATE(created_on) >= DATE(?) 
                          AND DATE(created_on) <= DATE(?)
                          AND status = 'paid' 
                     THEN total_amount ELSE 0 END), 0) as previous_period
       FROM invoices
       WHERE is_deleted = FALSE AND created_by = ?`,
      [fromDateTime, toDateTime, prevFromDateTime, prevToDateTime, loggedInUserId]
    );

    const currentPeriodMyRevenue = parseFloat(myRevenueChangeResult[0].current_period) || 0;
    const previousPeriodMyRevenue = parseFloat(myRevenueChangeResult[0].previous_period) || 0;
    const myRevenueChange = currentPeriodMyRevenue - previousPeriodMyRevenue;

    const totalRevenue = parseFloat(revenueResult[0].total_revenue) || 0;
    const myRevenue = parseFloat(myRevenueResult[0].my_revenue) || 0;
    const totalSales = parseInt(salesResult[0].total_sales) || 0;
    const mySales = parseInt(mySalesResult[0].my_sales) || 0;
    const totalCustomers = parseInt(customersResult[0].total_customers) || 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        myRevenue,
        totalSales,
        mySales,
        totalCustomers,
        revenueChange,
        myRevenueChange,
        salesChange,
        mySalesChange,
        customersChange
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get weekly revenue statistics
 */
export const getWeeklyRevenue = async (req, res) => {
  try {
    // Get date range from query parameters, default to last 5 weeks
    let fromDate = req.query.fromDate;
    let toDate = req.query.toDate;
    
    // If no dates provided, default to last 5 weeks
    if (!fromDate || !toDate) {
      const today = new Date();
      toDate = today.toISOString().split('T')[0];
      const fromDateObj = new Date(today);
      fromDateObj.setDate(fromDateObj.getDate() - 35); // 5 weeks = 35 days
      fromDate = fromDateObj.toISOString().split('T')[0];
    }

    const fromDateTime = `${fromDate} 00:00:00`;
    const toDateTime = `${toDate} 23:59:59`;

    // Get weekly revenue grouped by week
    // MySQL WEEK() function returns week number, YEARWEEK() gives year-week combination
    const [weeklyRevenueResult] = await pool.execute(
      `SELECT 
        YEARWEEK(created_on, 1) as year_week,
        YEAR(created_on) as year,
        WEEK(created_on, 1) as week,
        MIN(DATE(created_on)) as week_start,
        COALESCE(SUM(total_amount), 0) as revenue
       FROM invoices
       WHERE is_deleted = FALSE 
         AND status = 'paid'
         AND DATE(created_on) >= DATE(?)
         AND DATE(created_on) <= DATE(?)
       GROUP BY YEARWEEK(created_on, 1), YEAR(created_on), WEEK(created_on, 1)
       ORDER BY year_week ASC`,
      [fromDateTime, toDateTime]
    );

    // Format the data for frontend
    let weeklyData = weeklyRevenueResult.map(row => ({
      week: `Week ${row.week}`,
      weekStart: row.week_start,
      revenue: parseFloat(row.revenue) || 0,
      yearWeek: row.year_week
    }));

    // Get only the last 5 weeks
    if (weeklyData.length > 5) {
      weeklyData = weeklyData.slice(-5);
    }

    // Get total revenue for the period (last 5 weeks)
    const totalRevenue = weeklyData.reduce((sum, week) => sum + week.revenue, 0);

    res.json({
      success: true,
      data: {
        weeklyData,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Get weekly revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly revenue',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

