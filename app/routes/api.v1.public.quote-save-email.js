import { sendMicrosoftEmail } from "../config/microsoft-mailer";

export const action = async ({ request }) => {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed." }),
        { status: 405 }
      );
    }

    const data = await request.json();
    console.log('Quote save email request data:', data);

    // Validate required fields
    if (!data) {
      return new Response(
        JSON.stringify({ success: false, error: "No data provided." }),
        { status: 400 }
      );
    }

    const {
      email: receiver,
      quoteReference,
      quoteUrl,
      expiresAt,
      quoteName
    } = data;

    // Validate all required fields
    if (!receiver) {
      return new Response(
        JSON.stringify({ success: false, error: "Email address is required." }),
        { status: 400 }
      );
    }

    if (!quoteReference) {
      return new Response(
        JSON.stringify({ success: false, error: "Quote reference is required." }),
        { status: 400 }
      );
    }

    if (!quoteUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Quote URL is required." }),
        { status: 400 }
      );
    }

    if (!expiresAt) {
      return new Response(
        JSON.stringify({ success: false, error: "Expiration date is required." }),
        { status: 400 }
      );
    }

    console.log('Sending quote save email to:', receiver);

    // Format expiration date
    const formatDate = (dateString) => {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch (error) {
        console.error('Error formatting date:', error);
        return '30 days from now';
      }
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Your Shade Sail Quote Has Been Saved</title>
        </head>
        <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color:#f3f3f3;">
          <table align="center" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:20px 0;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color:#ffffff; border:1px solid #ddd; border-radius:8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="text-align:center; padding:30px 20px 20px;">
                      <img src="https://cdn.shopify.com/s/files/1/0778/8730/7969/files/Logo-horizontal-color_3x_8d83ab71-75cc-4486-8cf3-b510cdb69aa7.png?v=1728339550" style="max-width:200px;" alt="ShadeSpace" />
                    </td>
                  </tr>
                  
                  <!-- Title -->
                  <tr>
                    <td style="background-color:#01312D; color:#fff; padding:20px; font-size:20px; font-weight:bold; text-align:center;">
                      Your Quote Has Been Saved!
                    </td>
                  </tr>
                  
                  <!-- Introduction -->
                  <tr>
                    <td style="padding:25px 30px 15px; font-size:15px; line-height:1.6; color:#333;">
                      Hello,<br/><br/>
                      Thank you for saving your custom shade sail quote with ShadeSpace. Your configuration has been saved and you can access it anytime using the link below.
                    </td>
                  </tr>
                  
                  <!-- Quote Details Card -->
                  <tr>
                    <td style="padding:0 30px 20px;">
                      <table cellpadding="15" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; background-color:#f8fafc; border:2px solid #BFF102; border-radius:8px;">
                        ${quoteName ? `
                        <tr>
                          <td style="text-align:center; padding-bottom:0;">
                            <div style="font-size:14px; color:#64748B; margin-bottom:4px;">Quote Name</div>
                            <div style="font-size:16px; font-weight:600; color:#01312D;">${quoteName}</div>
                          </td>
                        </tr>
                        ` : ''}
                        <tr>
                          <td style="text-align:center;">
                            <div style="font-size:16px; font-weight:bold; color:#01312D; margin-bottom:8px;">Quote Reference</div>
                            <div style="font-size:20px; font-weight:bold; color:#307C31; font-family: monospace; letter-spacing:1px;">${quoteReference}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="text-align:center; padding-top:0;">
                            <div style="font-size:14px; color:#64748B; margin-bottom:4px;">Valid Until</div>
                            <div style="font-size:15px; font-weight:600; color:#01312D;">${formatDate(expiresAt)}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Access Link -->
                  <tr>
                    <td style="padding:0 30px 20px;">
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td style="padding:15px; background-color:#BFF102; border-radius:6px; text-align:center;">
                            <a href="${quoteUrl}" style="display:inline-block; padding:12px 30px; background-color:#01312D; color:white; text-decoration:none; border-radius:4px; font-weight:bold; font-size:15px;">
                              Access Your Quote
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 0 0; text-align:center;">
                            <div style="font-size:12px; color:#64748B;">
                              Or copy this link:<br/>
                              <span style="font-family:monospace; font-size:11px; word-break:break-all;">${quoteUrl}</span>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Next Steps -->
                  <tr>
                    <td style="padding:0 30px 25px;">
                      <div style="background-color:#e8f5e8; border-left:4px solid #307C31; padding:15px; border-radius:4px;">
                        <div style="font-size:15px; font-weight:bold; color:#01312D; margin-bottom:8px;">Next Steps</div>
                        <ul style="margin:0; padding-left:20px; color:#445; font-size:14px; line-height:1.5;">
                          <li>Your quote is valid for 30 days</li>
                          <li>Use the link above to access and modify your quote</li>
                          <li>Contact us if you have any questions</li>
                          <li>Ready to proceed? Click the link to complete your purchase</li>
                        </ul>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color:#f8fafc; padding:20px; text-align:center; font-size:13px; color:#64748B; border-top:1px solid #e2e8f0;">
                      Thank you for choosing <strong>ShadeSpace</strong> for your custom shade solution.<br/>
                      Need help? Contact us at <a href="mailto:support@shadespace.com" style="color:#307C31;">support@shadespace.com</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    // Prepare email data with safe defaults
    const emailData = {
      to: receiver,
      subject: `Your ShadeSpace Quote - ${quoteReference}`,
      html: emailHtml,
    };

    console.log('Sending email with data:', {
      to: receiver,
      subject: emailData.subject,
      hasHtml: !!emailHtml
    });

    // Send the email
    await sendMicrosoftEmail(emailData);

    console.log('Quote save email sent successfully to:', receiver);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Quote confirmation email sent successfully." 
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Quote save email error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Failed to send quote confirmation email.",
        details: error.message 
      }),
      { status: 500 }
    );
  }
};