// Validates XML files against an XSD using the JDK's built-in validator (no dependencies).
//   java tests/nemsis/XsdValidate.java <schema.xsd> <file.xml> [more.xml ...]
// Prints "OK <file>" or "INVALID <file>: line:col message" per file; exit code 1 if any file is invalid.
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXParseException;

public class XsdValidate {
  public static void main(String[] args) throws Exception {
    if (args.length < 2) {
      System.err.println("usage: XsdValidate <schema.xsd> <file.xml>...");
      System.exit(2);
    }
    SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
    Schema schema = factory.newSchema(new File(args[0]));
    boolean allOk = true;
    for (int i = 1; i < args.length; i++) {
      List<String> errors = new ArrayList<>();
      Validator validator = schema.newValidator();
      validator.setErrorHandler(new ErrorHandler() {
        public void warning(SAXParseException e) {}
        public void error(SAXParseException e) { errors.add(e.getLineNumber() + ":" + e.getColumnNumber() + " " + e.getMessage()); }
        public void fatalError(SAXParseException e) { errors.add(e.getLineNumber() + ":" + e.getColumnNumber() + " " + e.getMessage()); }
      });
      try {
        validator.validate(new StreamSource(new File(args[i])));
      } catch (SAXParseException e) {
        // already recorded by fatalError
      }
      if (errors.isEmpty()) {
        System.out.println("OK " + args[i]);
      } else {
        allOk = false;
        for (String err : errors) System.out.println("INVALID " + args[i] + ": " + err);
      }
    }
    System.exit(allOk ? 0 : 1);
  }
}
