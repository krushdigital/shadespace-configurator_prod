import transporter from "../config/nodemailer.config"

export const action = async ({ request }) => {
    try {

        if (request.method !== "POST") return new Response(JSON.stringify({ success: false, error: "Method not allowed." }), { status: 405 })

        const { pdf, details, receiver } = await request.json()
        console.log('{ pdf, details, receiver }: ', { pdf, details, receiver });

        if (!pdf || !details || !receiver) return new Response(JSON.stringify({ success: false, error: "Provide all required fields." }), { status: 400 })

        // const emailHtml = `
        //     <h2>Product Summary</h2>
        //     <p><b>Product Name:</b> ${details.name}</p>
        //     <p><b>Description:</b> ${details.description}</p>
        //     <p><b>Price:</b> ${details.price}</p>
        // `

        // const mailOptions = {
        //     from: process.env.USER_EMAIL,
        //     to: receiver,
        //     subject: `Product Summary: ${details.name}`,
        //     html: emailHtml,
        //     priority: "high",
        //     attachments: [
        //         {
        //             filename: `${details.name || "summary"}.pdf`,
        //             content: Buffer.from(pdf, "base64"),
        //             contentType: "application/pdf"
        //         }
        //     ]
        // }

        // await transporter.sendMail(mailOptions)

        new Response(JSON.stringify({ success: true, message: `Email summary sent on your mail.` }), { status: 200 })

    } catch (error) {
        if (error instanceof Error) {
            console.log(`An error occurred while sending email summary: ${error.message}`);
        } else {
            console.log(`An unknown error occurred.`);
        }

        return new Response(JSON.stringify({ success: false, error: 'Internal server error.' }), { status: 500 })
    }
}